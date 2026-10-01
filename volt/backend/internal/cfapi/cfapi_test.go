// Package cfapi tests — multipart deploy body shape + D1 query payload.
package cfapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestQueryParsesRows(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/d1/database/db1/query") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["sql"] != "SELECT 1" {
			t.Errorf("sql payload wrong: %v", body["sql"])
		}
		_, _ = io.WriteString(w, `{"success":true,"result":[{"results":[{"id":7,"cmd":"/stats"}]}]}`)
	}))
	defer srv.Close()
	c := New("acc", "tok")
	c.HC = srv.Client()
	// override the base URL
	old := c.HC
	_ = old
	c.AccountID = "acc"
	c.HC = &http.Client{Transport: rewriteTransport{srv.URL}}

	rows, err := c.Query("db1", "SELECT 1")
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(rows) != 1 || rows[0]["cmd"] != "/stats" {
		t.Fatalf("rows wrong: %v", rows)
	}
}

// rewriteTransport redirects every request to the test server.
type rewriteTransport struct{ base string }

func (rt rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	url := *req.URL
	url.Scheme = "http"
	if req.URL.Hostname() == "api.cloudflare.com" {
		// strip everything but the path → point at httptest server
		parts := strings.SplitN(url.Path, "/client/v4/accounts/", 2)
		if len(parts) == 2 {
			url.Path = "/accounts/" + parts[1]
		}
	}
	// simplest correct approach: rebuild against base host
	url.Host = strings.TrimPrefix(rt.base, "http://")
	if !strings.Contains(req.URL.Host, "cloudflare") {
		url.Host = req.URL.Host
	} else {
		url.Path = req.URL.Path // full account path
	}
	// the account path already lives in req.URL.Path — just swap the host
	url2 := *req.URL
	url2.Scheme = "http"
	url2.Host = strings.TrimPrefix(rt.base, "http://")
	req2 := req.Clone(req.Context())
	req2.URL = &url2
	return http.DefaultTransport.RoundTrip(req2)
}

func TestDeployWorkerMultipart(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ct := r.Header.Get("content-type")
		if !strings.HasPrefix(ct, "multipart/form-data") {
			t.Errorf("content-type %q", ct)
		}
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), `"main_module":"worker.js"`) {
			t.Error("metadata main_module missing")
		}
		if !strings.Contains(string(body), `"type":"d1"`) {
			t.Error("d1 binding missing")
		}
		if !strings.Contains(string(body), "VOLT-WORKER-SOURCE") {
			t.Error("worker source missing")
		}
		_, _ = io.WriteString(w, `{"success":true,"result":{}}`)
	}))
	defer srv.Close()

	c := New("acc", "tok")
	c.HC = &http.Client{Transport: rewriteTransport{srv.URL}}
	err := c.DeployWorker("volt-test", []byte("VOLT-WORKER-SOURCE"), []Binding{
		{Type: "d1", Name: "DB", ID: "db1"},
		{Type: "plain_text", Name: "GATE", Text: "g1"},
	}, "2024-09-23")
	if err != nil {
		t.Fatalf("DeployWorker: %v", err)
	}
}
