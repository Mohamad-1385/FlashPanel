// Package vlessprobe — a native Go VLESS-over-WebSocket client.
// Used by `flashctl verify` for live end-to-end panel smoke tests:
// TLS → WS upgrade → VLESS handshake → HTTP request → response proof.
// Zero dependencies: TLS + the RFC6455 frames are written by hand.
package vlessprobe

import (
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"strings"
	"time"
)

// Probe connects to a FLASHLAB panel and runs tunneled requests.
type Probe struct {
	Host string // panel hostname (flashlab-core-xxxx.nasabaghili.workers.dev)
	Path string // tunnel path prefix (tpath)
	UUID string // key uuid
}

// wsConn is a hand-rolled websocket over TLS.
type wsConn struct {
	conn net.Conn
}

func (w *wsConn) sendFrame(payload []byte) error {
	var hdr []byte
	n := len(payload)
	mask := make([]byte, 4)
	if _, err := rand.Read(mask); err != nil {
		return err
	}
	if n < 126 {
		hdr = []byte{0x82, 0x80 | byte(n)}
	} else if n < 65536 {
		hdr = []byte{0x82, 0x80 | 126, byte(n >> 8), byte(n)}
	} else {
		hdr = make([]byte, 10)
		hdr[0], hdr[1] = 0x82, 0x80|127
		binary.BigEndian.PutUint64(hdr[2:], uint64(n))
	}
	out := append(hdr, mask...)
	masked := make([]byte, n)
	for i, b := range payload {
		masked[i] = b ^ mask[i%4]
	}
	out = append(out, masked...)
	_, err := w.conn.Write(out)
	return err
}

// readFrame reads one server frame payload (text/binary).
func (w *wsConn) readFrame(deadline time.Time) ([]byte, byte, error) {
	head := make([]byte, 2)
	if err := w.conn.SetReadDeadline(deadline); err != nil {
		return nil, 0, err
	}
	if _, err := io.ReadFull(w.conn, head); err != nil {
		return nil, 0, err
	}
	op := head[0] & 0x0f
	length := int64(head[1] & 0x7f)
	switch length {
	case 126:
		ext := make([]byte, 2)
		if _, err := io.ReadFull(w.conn, ext); err != nil {
			return nil, 0, err
		}
		length = int64(binary.BigEndian.Uint16(ext))
	case 127:
		ext := make([]byte, 8)
		if _, err := io.ReadFull(w.conn, ext); err != nil {
			return nil, 0, err
		}
		length = int64(binary.BigEndian.Uint64(ext))
	}
	if length < 0 || length > 1<<20 {
		return nil, 0, fmt.Errorf("frame too large: %d", length)
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(w.conn, buf); err != nil {
		return nil, 0, err
	}
	return buf, op, nil
}

// dial opens the TLS+WS tunnel (path is always normalized to /tpath/uuid/).
func (p *Probe) dial(path string) (*wsConn, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	d := &net.Dialer{Timeout: 8 * time.Second}
	conn, err := tls.DialWithDialer(d, "tcp", p.Host+":443", &tls.Config{
		ServerName: p.Host, NextProtos: []string{"http/1.1"},
	})
	if err != nil {
		return nil, fmt.Errorf("tls: %w", err)
	}
	keyB := make([]byte, 16)
	_, _ = rand.Read(keyB)
	key := base64.StdEncoding.EncodeToString(keyB)
	req := fmt.Sprintf("GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n", path, p.Host, key)
	if _, err := conn.Write([]byte(req)); err != nil {
		return nil, err
	}
	var hdr []byte
	buf := make([]byte, 1)
	for len(hdr) < 4 || string(hdr[len(hdr)-4:]) != "\r\n\r\n" {
		if _, err := io.ReadFull(conn, buf); err != nil {
			return nil, fmt.Errorf("handshake read: %w", err)
		}
		hdr = append(hdr, buf[0])
		if len(hdr) > 8192 {
			return nil, fmt.Errorf("handshake too large")
		}
	}
	if !strings.Contains(string(hdr), " 101 ") {
		return nil, fmt.Errorf("no 101: %.60s", strings.SplitN(string(hdr), "\r\n", 2)[0])
	}
	_ = conn.SetDeadline(time.Now().Add(20 * time.Second))
	return &wsConn{conn: conn}, nil
}

// vlessHeader builds [ver][uuid][addon=0][cmd][port][atyp=domain][len][addr].
func vlessHeader(uuidStr, host string, port int, cmd byte) []byte {
	u, err := hex.DecodeString(strings.ReplaceAll(uuidStr, "-", ""))
	if err != nil || len(u) != 16 {
		return nil
	}
	addr := []byte(host)
	out := make([]byte, 0, 23+len(addr))
	out = append(out, 0x00)
	out = append(out, u...)
	out = append(out, 0x00, cmd, byte(port>>8), byte(port))
	out = append(out, 0x02, byte(len(addr)))
	out = append(out, addr...)
	return out
}

// HTTP runs one GET through the tunnel and returns the first response line.
func (p *Probe) HTTP(target string, port int, path string) (string, int64, error) {
	t0 := time.Now()
	ws, err := p.dial(p.Path + "/" + p.UUID + "/")
	if err != nil {
		return "", 0, err
	}
	defer ws.conn.Close()

	hdr := vlessHeader(p.UUID, target, port, 1)
	req := []byte("GET " + path + " HTTP/1.1\r\nHost: " + target + "\r\nConnection: close\r\n\r\n")
	if err := ws.sendFrame(append(hdr, req...)); err != nil {
		return "", 0, err
	}

	deadline := time.Now().Add(10 * time.Second)
	var resp []byte
	gotReply := false
	for time.Now().Before(deadline) {
		payload, op, err := ws.readFrame(deadline)
		if err != nil {
			break
		}
		if op == 8 { // close
			break
		}
		if len(payload) < 2 {
			continue
		}
		if !gotReply {
			if payload[0] != 0x00 || payload[1] != 0x00 {
				return "", 0, fmt.Errorf("bad vless reply: %x", payload[:2])
			}
			gotReply = true
			resp = append(resp, payload[2:]...)
		} else {
			resp = append(resp, payload...)
		}
		if strings.Contains(string(resp), "\r\n") && len(resp) > 16 {
			break // first line complete
		}
	}
	if !gotReply {
		return "", 0, fmt.Errorf("no vless reply")
	}
	line := strings.SplitN(string(resp), "\r\n", 2)[0]
	return line, time.Since(t0).Milliseconds(), nil
}

// DNSQuery runs one DNS lookup through the UDP-DNS bridge (cmd=2, port 53).
func (p *Probe) DNSQuery(domain string) (bool, int64, error) {
	t0 := time.Now()
	ws, err := p.dial(p.Path + "/" + p.UUID + "/")
	if err != nil {
		return false, 0, err
	}
	defer ws.conn.Close()

	q := buildDNSQuery(domain)
	hdr := vlessHeader(p.UUID, "8.8.8.8", 53, 2)
	frame := make([]byte, 0, 2+len(q))
	frame = append(frame, byte(len(q)>>8), byte(len(q)))
	frame = append(frame, q...)
	if err := ws.sendFrame(append(hdr, frame...)); err != nil {
		return false, 0, err
	}

	deadline := time.Now().Add(9 * time.Second)
	gotReply := false
	for time.Now().Before(deadline) {
		payload, op, err := ws.readFrame(deadline)
		if err != nil || op == 8 {
			break
		}
		if !gotReply {
			// frame 1: the VLESS reply [0,0]
			if len(payload) == 2 && payload[0] == 0 && payload[1] == 0 {
				gotReply = true
			}
			continue
		}
		// frame 2: [len16][dns answer]
		if len(payload) >= 4 {
			ln := int(payload[0])<<8 | int(payload[1])
			if ln >= 12 {
				return true, time.Since(t0).Milliseconds(), nil
			}
		}
	}
	return false, time.Since(t0).Milliseconds(), fmt.Errorf("no dns answer")
}

func buildDNSQuery(domain string) []byte {
	var q []byte
	id := make([]byte, 2)
	_, _ = rand.Read(id)
	q = append(q, id...)
	q = append(q, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00)
	for _, label := range strings.Split(domain, ".") {
		if label == "" {
			continue
		}
		q = append(q, byte(len(label)))
		q = append(q, []byte(label)...)
	}
	q = append(q, 0x00, 0x00, 0x01, 0x00, 0x01)
	return q
}

// WrongUUID connects with a fake uuid and proves the denial.
func (p *Probe) WrongUUID() (bool, error) {
	fake := make([]byte, 16)
	_, _ = rand.Read(fake)
	fakeUUID := hex.EncodeToString(fake[:4]) + "-" + hex.EncodeToString(fake[4:6]) + "-" + hex.EncodeToString(fake[6:8]) + "-" + hex.EncodeToString(fake[8:10]) + "-" + hex.EncodeToString(fake[10:])
	pp := &Probe{Host: p.Host, Path: p.Path, UUID: fakeUUID}
	ws, err := pp.dial(pp.Path + "/" + fakeUUID + "/")
	if err != nil {
		return false, err
	}
	defer ws.conn.Close()
	if err := ws.sendFrame(vlessHeader(fakeUUID, "gstatic.com", 80, 1)); err != nil {
		return false, err
	}
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		payload, op, err := ws.readFrame(deadline)
		if err != nil {
			return true, nil // killed without reply = denied
		}
		if op == 8 {
			return true, nil
		}
		if len(payload) >= 2 && (payload[0] != 0 || payload[1] != 0) {
			return false, fmt.Errorf("unexpected reply to fake uuid")
		}
		if len(payload) > 4 {
			return false, fmt.Errorf("data leaked for fake uuid")
		}
	}
	return true, nil
}

// sha1of is the RFC 6455 accept-key derivation (kept for parity checks).
func sha1of(s string) string {
	h := sha1.Sum([]byte(s))
	return base64.StdEncoding.EncodeToString(h[:])
}
