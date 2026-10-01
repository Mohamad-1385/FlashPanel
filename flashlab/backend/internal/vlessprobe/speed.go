// Speed test through the REAL tunnel — the honest way to measure what a user
// measures: bytes DOWNLOADED through the VLESS tunnel per second.
// Path: TLS-wrapped tunnel (speed.cloudflare.com is CF-hosted → rides the
// relay chain — exactly what a browser experiences on CF sites).
// v1.0.0 fix: the first cut sent a plaintext GET to :443 — a TLS port answers
// nothing; the tunnel must be wrapped in tls.Client first.
package vlessprobe

import (
        "crypto/tls"
        "errors"
        "fmt"
        "io"
        "net"
        "sync"
        "time"
)

// SpeedResult is one throughput measurement.
type SpeedResult struct {
        Bytes    int64
        Ms       int64
        MBps     float64
        First    string // first response line (proof of a real answer)
        DirectMs int64  // gstatic RTT through the same key (direct egress path)
}

// tunnelConn adapts the raw WS/VLESS stream to a net.Conn so tls.Client can
// run a real TLS session THROUGH the tunnel. It strips the [0,0] VLESS reply,
// demuxes WS frames and answers server pings (the 25s heartbeat).
type tunnelConn struct {
        ws      *wsConn
        mu      sync.Mutex
        buf     []byte
        replied bool
        closed  bool
}

func (t *tunnelConn) Read(p []byte) (int, error) {
        for {
                if len(t.buf) > 0 {
                        n := copy(p, t.buf)
                        t.buf = t.buf[n:]
                        return n, nil
                }
                payload, op, err := t.ws.readFrame(time.Now().Add(40 * time.Second))
                if err != nil {
                        return 0, err
                }
                switch op {
                case 8: // close
                        return 0, io.EOF
                case 9: // server ping → masked empty pong
                        _, _ = t.ws.conn.Write([]byte{0x8a, 0x80, 0, 0, 0, 0})
                        continue
                }
                // A bare [0,0] frame is ALWAYS the VLESS reply (a real TLS record is
                // never two zero bytes) — skip it however many times it arrives (the
                // duplicate-reply race existed on pre-fix workers; the worker now
                // guards the handshake, the client stays defensive either way).
                if len(payload) == 2 && payload[0] == 0 && payload[1] == 0 {
                        t.replied = true
                        continue
                }
                if !t.replied {
                        return 0, errors.New("no vless reply before data")
                }
                t.buf = payload
        }
}

func (t *tunnelConn) Write(p []byte) (int, error) {
        if err := t.ws.sendFrame(p); err != nil {
                return 0, err
        }
        return len(p), nil
}

func (t *tunnelConn) Close() error {
        t.mu.Lock()
        defer t.mu.Unlock()
        if t.closed {
                return nil
        }
        t.closed = true
        return t.ws.conn.Close()
}

func (t *tunnelConn) LocalAddr() net.Addr                { return dummyAddr{} }
func (t *tunnelConn) RemoteAddr() net.Addr               { return dummyAddr{} }
func (t *tunnelConn) SetDeadline(tm time.Time) error      { return t.ws.conn.SetDeadline(tm) }
func (t *tunnelConn) SetReadDeadline(tm time.Time) error  { return t.ws.conn.SetReadDeadline(tm) }
func (t *tunnelConn) SetWriteDeadline(tm time.Time) error { return t.ws.conn.SetWriteDeadline(tm) }

type dummyAddr struct{}

func (dummyAddr) Network() string { return "tunnel" }
func (dummyAddr) String() string  { return "vless/tunnel" }

// SpeedTest downloads `bytes` from speed.cloudflare.com/__down through a TLS
// session carried by the tunnel opened with this key; reports throughput.
func (p *Probe) SpeedTest(bytes int64) (*SpeedResult, error) {
        if bytes <= 0 {
                bytes = 5 * 1024 * 1024 // 5 MB default
        }
        ws, err := p.dial(p.Path + "/" + p.UUID + "/")
        if err != nil {
                return nil, fmt.Errorf("tunnel: %w", err)
        }
        defer ws.conn.Close()
        _ = ws.conn.SetDeadline(time.Now().Add(60 * time.Second))

        // VLESS handshake — the [0,0] reply is stripped by tunnelConn.Read
        if err := ws.sendFrame(vlessHeader(p.UUID, "speed.cloudflare.com", 443, 1)); err != nil {
                return nil, err
        }
        tc := &tunnelConn{ws: ws}
        tlsSock := tls.Client(tc, &tls.Config{ServerName: "speed.cloudflare.com", NextProtos: []string{"http/1.1"}})
        if err := tlsSock.Handshake(); err != nil {
                return nil, fmt.Errorf("tls-through-tunnel: %w", err)
        }
        defer tlsSock.Close()

        t0 := time.Now()
        req := fmt.Sprintf("GET /__down?bytes=%d HTTP/1.1\r\nHost: speed.cloudflare.com\r\nUser-Agent: flashlab-go\r\nConnection: close\r\n\r\n", bytes)
        if _, err := tlsSock.Write([]byte(req)); err != nil {
                return nil, err
        }

        var total int64
        var first string
        buf := make([]byte, 16384)
        for total < bytes {
                n, rerr := tlsSock.Read(buf)
                if n > 0 {
                        chunk := buf[:n]
                        total += int64(n)
                        if first == "" {
                                for i := 0; i+1 < len(chunk); i++ {
                                        if chunk[i] == '\r' && chunk[i+1] == '\n' {
                                                first = string(chunk[:i])
                                                break
                                        }
                                }
                        }
                }
                if rerr != nil {
                        if rerr == io.EOF && total > 0 {
                                break
                        }
                        if total > 0 {
                                break // partial is still a measurement
                        }
                        return nil, rerr
                }
                if time.Since(t0) > 45*time.Second {
                        break
                }
        }
        if total == 0 {
                return nil, fmt.Errorf("zero bytes (relay path dead?)")
        }
        ms := time.Since(t0).Milliseconds()
        if ms < 1 {
                ms = 1
        }
        res := &SpeedResult{Bytes: total, Ms: ms, MBps: float64(total) / 1048576 / (float64(ms) / 1000), First: first}

        // direct-path RTT (gstatic is non-CF → worker egress, no relay)
        if line, dms, err := p.HTTP("www.gstatic.com", 80, "/generate_204"); err == nil {
                res.DirectMs = dms
                _ = line
        }
        return res, nil
}
