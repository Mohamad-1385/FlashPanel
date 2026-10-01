// Package panel is the VOLT worker REST client (botkey-authenticated).
package panel

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client talks to one deployed panel.
type Client struct {
	Base   string // https://volt-core-xxxx.nasabaghili.workers.dev
	BotKey string
	HC     *http.Client
}

// New builds the panel client.
func New(base, botKey string) *Client {
	return &Client{Base: base, BotKey: botKey, HC: &http.Client{Timeout: 30 * time.Second}}
}

func (c *Client) call(method, path string, body any, out any) error {
	if c.HC == nil {
		c.HC = &http.Client{Timeout: 30 * time.Second}
	}
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.Base+path, rd)
	if err != nil {
		return err
	}
	req.Header.Set("x-volt-key", c.BotKey)
	req.Header.Set("content-type", "application/json")
	resp, err := c.HC.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

// ── API payload mirrors ──

type Key struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	UUID      string `json:"uuid"`
	Loc       string `json:"loc"`
	IPMode    string `json:"ip_mode"`
	Adblock   int    `json:"adblock"`
	Status    string `json:"status"`
	QuotaGB   float64 `json:"quota_gb"`
	UsedBytes int64  `json:"used_bytes"`
	ExpiryMs  int64  `json:"expiry_ms"`
	Note      string `json:"note"`
	CreatedAt int64  `json:"created_at"`
	LastActive *int64 `json:"last_active"`
}

type Stats struct {
	Keys          int     `json:"keys"`
	Active        int     `json:"active"`
	Online        int     `json:"online"`
	TrafficToday  int64   `json:"trafficToday"`
	LifetimeBytes int64   `json:"lifetimeBytes"`
	Locations     int     `json:"locations"`
	Build         string  `json:"build"`
	TS            int64   `json:"ts"`
}

type Settings struct {
	Adblock      int    `json:"adblock"`
	IPMode       string `json:"ip_mode"`
	PanelName    string `json:"panel_name"`
	FlaglessExit string `json:"flagless_exit"`
}

// Health is the public liveness probe.
type Health struct {
	OK    bool   `json:"ok"`
	Build string `json:"build"`
	Core  string `json:"core"`
	Name  string `json:"name"`
	TS    int64  `json:"ts"`
}

type statsResp struct {
	OK       bool      `json:"ok"`
	Stats    Stats     `json:"stats"`
	Settings Settings  `json:"settings"`
}
type keysResp struct {
	OK   bool  `json:"ok"`
	Keys []Key `json:"keys"`
}
type keyResp struct {
	OK  bool `json:"ok"`
	Key Key  `json:"key"`
}
type healthResp struct {
	OK    bool   `json:"ok"`
	Build string `json:"build"`
	Core  string `json:"core"`
	Name  string `json:"name"`
	TS    int64  `json:"ts"`
}
type bridgeResp struct {
	OK     bool `json:"ok"`
	Outbox []struct {
		ID   int64  `json:"id"`
		TS   int64  `json:"ts"`
		Text string `json:"text"`
		Kind string `json:"kind"`
	} `json:"outbox"`
}

// Health checks liveness.
func (c *Client) Health() (*Health, error) {
	var h healthResp
	if err := c.call("GET", "/api/v1/health", nil, &h); err != nil {
		return nil, err
	}
	return &Health{OK: h.OK, Build: h.Build, Core: h.Core, Name: h.Name, TS: h.TS}, nil
}

// Stats fetches dashboard stats + settings.
func (c *Client) Stats() (*Stats, *Settings, error) {
	var r statsResp
	if err := c.call("GET", "/api/v1/stats", nil, &r); err != nil {
		return nil, nil, err
	}
	return &r.Stats, &r.Settings, nil
}

// ListKeys returns all keys.
func (c *Client) ListKeys() ([]Key, error) {
	var r keysResp
	if err := c.call("GET", "/api/v1/keys", nil, &r); err != nil {
		return nil, err
	}
	return r.Keys, nil
}

// NewKeyOpts describes a key creation request.
type NewKeyOpts struct {
	Name       string  `json:"name"`
	Loc        string  `json:"loc,omitempty"`
	QuotaGB    float64 `json:"quota_gb,omitempty"`
	ExpiryDays int     `json:"expiry_days,omitempty"`
	IPMode     string  `json:"ip_mode,omitempty"`
}

// CreateKey provisions a key.
func (c *Client) CreateKey(o NewKeyOpts) (*Key, error) {
	var r keyResp
	if err := c.call("POST", "/api/v1/keys", o, &r); err != nil {
		return nil, err
	}
	if !r.OK {
		return nil, fmt.Errorf("create failed")
	}
	return &r.Key, nil
}

// PatchKey applies partial updates (loc/ip_mode/adblock/status/add_gb/add_days).
func (c *Client) PatchKey(uuid string, patch map[string]any) (*Key, error) {
	var r keyResp
	if err := c.call("POST", "/api/v1/keys/"+uuid, patch, &r); err != nil {
		return nil, err
	}
	return &r.Key, nil
}

// DeleteKey removes a key.
func (c *Client) DeleteKey(uuid string) error {
	return c.call("DELETE", "/api/v1/keys/"+uuid, nil, nil)
}

// SetSettings updates panel defaults.
func (c *Client) SetSettings(s map[string]any) error {
	return c.call("POST", "/api/v1/settings", s, nil)
}

// OutboxAfter drains the bridge outbox (panel terminal replies).
func (c *Client) OutboxAfter(afterID int64) (*bridgeResp, error) {
	var r bridgeResp
	err := c.call("GET", fmt.Sprintf("/api/v1/bridge?after=%d", afterID), nil, &r)
	return &r, err
}
