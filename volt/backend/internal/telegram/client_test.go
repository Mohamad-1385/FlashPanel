// Package telegram tests — payload shapes against a local API stub.
package telegram

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func stubTG(t *testing.T, handler func(body string) string) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(handler(string(b))))
	}))
	t.Cleanup(srv.Close)
	c := New("TEST:TOKEN")
	c.HC = srv.Client()
	c.Base = srv.URL
	return c
}

func TestSendMessagePayload(t *testing.T) {
	c := stubTG(t, func(body string) string {
		var m map[string]any
		_ = json.Unmarshal([]byte(body), &m)
		if m["chat_id"] != float64(42) {
			t.Errorf("chat_id = %v", m["chat_id"])
		}
		if m["parse_mode"] != "HTML" {
			t.Errorf("parse_mode = %v", m["parse_mode"])
		}
		if !strings.Contains(m["text"].(string), "سلام") {
			t.Errorf("text missing: %v", m["text"])
		}
		rm, _ := json.Marshal(m["reply_markup"])
		if !strings.Contains(string(rm), "inline_keyboard") {
			t.Errorf("inline keyboard missing: %s", rm)
		}
		return `{"ok":true,"result":{"message_id":77}}`
	})
	id, err := c.SendMessage(42, "سلام <b>دنیا</b>", [][]InlineButton{{{Text: "بزن", Data: "/stats"}}})
	if err != nil {
		t.Fatalf("SendMessage: %v", err)
	}
	if id != 77 {
		t.Fatalf("message_id = %d", id)
	}
}

func TestSendDocumentMultipart(t *testing.T) {
	c := stubTG(t, func(body string) string {
		// body arrives as multipart; verify filename + content presence
		if !strings.Contains(body, "filename=\"report.png\"") {
			t.Errorf("filename missing")
		}
		if !strings.Contains(body, "PNGDATA") {
			t.Errorf("file content missing")
		}
		return `{"ok":true,"result":{"message_id":88}}`
	})
	id, err := c.SendDocument(42, "report.png", "image/png", []byte("PNGDATA-HERE"), "گزارش")
	if err != nil {
		t.Fatalf("SendDocument: %v", err)
	}
	if id != 88 {
		t.Fatalf("id = %d", id)
	}
}

func TestGetUpdates(t *testing.T) {
	c := stubTG(t, func(body string) string {
		return `{"ok":true,"result":[{"update_id":10,"message":{"message_id":1,"chat":{"id":5},"text":"/start"}}]}`
	})
	ups, err := c.GetUpdates(0, 1)
	if err != nil {
		t.Fatalf("GetUpdates: %v", err)
	}
	if len(ups) != 1 || ups[0].Message.Text != "/start" {
		t.Fatalf("updates wrong: %+v", ups)
	}
}

func TestNoTokenIsNoop(t *testing.T) {
	c := New("")
	if _, err := c.SendMessage(1, "x", nil); err == nil {
		t.Fatal("empty token must error")
	}
}
