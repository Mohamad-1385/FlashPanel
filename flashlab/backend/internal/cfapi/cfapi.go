// Package cfapi is a Cloudflare API v4 client for the FLASHLAB daemon:
// D1 queries (the Go↔panel bridge bus), worker deploy (multipart), D1 lifecycle.
package cfapi

import (
        "bytes"
        "crypto/rand"
        "encoding/hex"
        "encoding/json"
        "fmt"
        "io"
        "mime/multipart"
        "net/http"
        "time"
)

// Client holds the account + token.
type Client struct {
        AccountID string
        Token     string
        HC        *http.Client
}

// New builds the client.
func New(accountID, token string) *Client {
        return &Client{AccountID: accountID, Token: token, HC: &http.Client{Timeout: 60 * time.Second}}
}

func (c *Client) do(method, path string, contentType string, body io.Reader) (json.RawMessage, error) {
        base := "https://api.cloudflare.com/client/v4"
        if c.AccountID != "" {
                base += "/accounts/" + c.AccountID
        }
        req, err := http.NewRequest(method, base+path, body)
        if err != nil {
                return nil, err
        }
        req.Header.Set("authorization", "Bearer "+c.Token)
        if contentType != "" {
                req.Header.Set("content-type", contentType)
        }
        resp, err := c.HC.Do(req)
        if err != nil {
                return nil, err
        }
        defer resp.Body.Close()
        raw, _ := io.ReadAll(resp.Body)
        var ar struct {
                Success bool            `json:"success"`
                Errors  []struct {
                        Message string `json:"message"`
                } `json:"errors"`
                Result json.RawMessage `json:"result"`
        }
        if err := json.Unmarshal(raw, &ar); err != nil {
                return nil, fmt.Errorf("cf: bad json (%.120s)", string(raw))
        }
        if !ar.Success {
                msg := ""
                if len(ar.Errors) > 0 {
                        msg = ar.Errors[0].Message
                }
                return nil, fmt.Errorf("cf %s %s: %s", method, path, msg)
        }
        return ar.Result, nil
}

// Row is one D1 result row.
type Row = map[string]any

// Query runs a D1 statement (with optional params) and returns rows.
func (c *Client) Query(dbID, sql string, params ...any) ([]Row, error) {
        payload := map[string]any{"sql": sql}
        if len(params) > 0 {
                payload["params"] = params
        }
        b, _ := json.Marshal(payload)
        res, err := c.do("POST", "/d1/database/"+dbID+"/query", "application/json", bytes.NewReader(b))
        if err != nil {
                return nil, err
        }
        var outer []struct {
                Results []Row `json:"results"`
        }
        if err := json.Unmarshal(res, &outer); err != nil || len(outer) == 0 {
                return nil, err
        }
        return outer[0].Results, nil
}

// Exec runs a D1 statement and ignores rows.
func (c *Client) Exec(dbID, sql string, params ...any) error {
        _, err := c.Query(dbID, sql, params...)
        return err
}

// CreateD1 provisions a new D1 database.
func (c *Client) CreateD1(name string) (id string, err error) {
        b, _ := json.Marshal(map[string]string{"name": name})
        res, err := c.do("POST", "/d1/database", "application/json", bytes.NewReader(b))
        if err != nil {
                return "", err
        }
        var out struct {
                UUID string `json:"uuid"`
        }
        if err := json.Unmarshal(res, &out); err != nil {
                return "", err
        }
        return out.UUID, nil
}

// DeleteD1 removes a database (panel teardown).
func (c *Client) DeleteD1(dbID string) error {
        _, err := c.do("DELETE", "/d1/database/"+dbID, "", nil)
        return err
}

// Binding describes one worker binding.
type Binding struct {
        Type string `json:"type"`
        Name string `json:"name"`
        ID   string `json:"id,omitempty"`
        Text string `json:"text,omitempty"`
}

// DeployWorker uploads worker.js (module syntax) with its bindings.
func (c *Client) DeployWorker(name string, source []byte, bindings []Binding, compatDate string) error {
        if compatDate == "" {
                compatDate = "2024-09-23"
        }
        meta := map[string]any{
                "main_module":        "worker.js",
                "compatibility_date": compatDate,
                "bindings":           bindings,
        }
        metaJSON, _ := json.Marshal(meta)

        var buf bytes.Buffer
        mw := multipart.NewWriter(&buf)
        b := make([]byte, 6)
        _, _ = rand.Read(b)
        boundary := "----flashlab" + hex.EncodeToString(b)

        _ = mw.SetBoundary(boundary)
        mh := make(map[string][]string)
        mh["Content-Disposition"] = []string{`form-data; name="metadata"`}
        mh["Content-Type"] = []string{"application/json"}
        part, _ := mw.CreatePart(mh)
        _, _ = part.Write(metaJSON)

        mh2 := make(map[string][]string)
        mh2["Content-Disposition"] = []string{`form-data; name="worker.js"; filename="worker.js"`}
        mh2["Content-Type"] = []string{"application/javascript+module"}
        part2, _ := mw.CreatePart(mh2)
        _, _ = part2.Write(source)
        _ = mw.Close()

        _, err := c.do("PUT", "/workers/scripts/"+name, mw.FormDataContentType(), &buf)
        return err
}

// EnableSubdomain turns on <name>.<account>.workers.dev routing.
func (c *Client) EnableSubdomain(name string) error {
        b, _ := json.Marshal(map[string]any{"enabled": true, "previews_enabled": false})
        _, err := c.do("POST", "/workers/scripts/"+name+"/subdomain", "application/json", bytes.NewReader(b))
        return err
}

// DeleteWorker removes a worker (panel teardown).
func (c *Client) DeleteWorker(name string) error {
        _, err := c.do("DELETE", "/workers/scripts/"+name, "", nil)
        return err
}

// FirstAccountID resolves the token's first account (used when config.json
// doesn't exist yet — the first-deploy bootstrap). `do` already unwraps the
// envelope's `result` field — so here we unmarshal the bare array.
func (c *Client) FirstAccountID() (string, error) {
        raw, err := c.do("GET", "/accounts", "", nil)
        if err != nil {
                return "", err
        }
        var ids []struct {
                ID string `json:"id"`
        }
        if err := json.Unmarshal(raw, &ids); err != nil {
                return "", err
        }
        if len(ids) == 0 {
                return "", fmt.Errorf("token has no accounts")
        }
        return ids[0].ID, nil
}
