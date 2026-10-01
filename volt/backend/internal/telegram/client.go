// Package telegram is a Bot API client written from scratch for VOLT —
// long-polling getUpdates, sendMessage/editMessageText/sendDocument with
// inline keyboards, HTML parse mode, 429 retry-after handling.
package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client talks to one bot token.
type Client struct {
	Token string
	Base  string // API base override (tests); empty → api.telegram.org
	HC    *http.Client
	Me   *User
}

func (c *Client) apiBase() string {
	if c.Base != "" {
		return c.Base
	}
	return "https://api.telegram.org"
}

// New builds a client (token may be empty → all calls become no-ops).
func New(token string) *Client {
	return &Client{Token: token, HC: &http.Client{Timeout: 65 * time.Second}}
}

// ── API types (subset VOLT uses) ──

type User struct {
	ID        int64  `json:"id"`
	IsBot     bool   `json:"is_bot"`
	FirstName string `json:"first_name"`
	Username  string `json:"username"`
}

type Chat struct {
	ID int64 `json:"id"`
}

type Message struct {
	MessageID int64  `json:"message_id"`
	From      *User  `json:"from"`
	Chat      Chat   `json:"chat"`
	Text      string `json:"text"`
}

type CallbackQuery struct {
	ID      string   `json:"id"`
	From    User     `json:"from"`
	Message *Message `json:"message"`
	Data    string   `json:"data"`
}

type Update struct {
	UpdateID      int64          `json:"update_id"`
	Message       *Message       `json:"message"`
	CallbackQuery *CallbackQuery `json:"callback_query"`
}

type InlineButton struct {
	Text string `json:"text"`
	Data string `json:"callback_data"`
}
type InlineKeyboard struct {
	InlineKeyboard [][]InlineButton `json:"inline_keyboard"`
}

type replyMarkup struct {
	InlineKeyboard [][]InlineButton `json:"inline_keyboard,omitempty"`
	Keyboard       [][]KeyboardBtn  `json:"keyboard,omitempty"`
	ResizeKeyboard bool             `json:"resize_keyboard,omitempty"`
	IsPersistent   bool             `json:"is_persistent,omitempty"`
}
type KeyboardBtn struct {
	Text string `json:"text"`
}

// ── low-level call ──

type apiResp struct {
	OK          bool            `json:"ok"`
	Result      json.RawMessage `json:"result"`
	Description string          `json:"description"`
	Parameters  *struct {
		RetryAfter int `json:"retry_after"`
	} `json:"parameters"`
}

func (c *Client) call(method string, payload any, out any) error {
	if c.Token == "" {
		return fmt.Errorf("telegram: no token")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	for attempt := 0; attempt < 3; attempt++ {
		req, _ := http.NewRequest("POST", c.apiBase()+"/bot"+c.Token+"/"+method, bytes.NewReader(body))
		req.Header.Set("content-type", "application/json")
		resp, err := c.HC.Do(req)
		if err != nil {
			time.Sleep(time.Duration(attempt+1) * time.Second)
			continue
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		var ar apiResp
		if err := json.Unmarshal(raw, &ar); err != nil {
			return err
		}
		if !ar.OK {
			if ar.Parameters != nil && ar.Parameters.RetryAfter > 0 {
				time.Sleep(time.Duration(ar.Parameters.RetryAfter+1) * time.Second)
				continue
			}
			return fmt.Errorf("telegram %s: %s", method, ar.Description)
		}
		if out != nil && len(ar.Result) > 0 {
			return json.Unmarshal(ar.Result, out)
		}
		return nil
	}
	return fmt.Errorf("telegram %s: retries exhausted", method)
}

// GetMe verifies the token and caches the bot identity.
func (c *Client) GetMe() (*User, error) {
	if c.Me != nil {
		return c.Me, nil
	}
	var u User
	if err := c.call("getMe", map[string]any{}, &u); err != nil {
		return nil, err
	}
	c.Me = &u
	return &u, nil
}

// SendMessage delivers an HTML message (optionally with an inline keyboard).
func (c *Client) SendMessage(chatID int64, text string, kb [][]InlineButton) (int64, error) {
	p := map[string]any{
		"chat_id": chatID, "text": text, "parse_mode": "HTML",
		"disable_web_page_preview": true,
	}
	if kb != nil {
		p["reply_markup"] = replyMarkup{InlineKeyboard: kb}
	}
	var m Message
	err := c.call("sendMessage", p, &m)
	return m.MessageID, err
}

// EditMessageText rewrites a live message (progress charts / live values).
func (c *Client) EditMessageText(chatID, msgID int64, text string, kb [][]InlineButton) error {
	p := map[string]any{
		"chat_id": chatID, "message_id": msgID, "text": text, "parse_mode": "HTML",
		"disable_web_page_preview": true,
	}
	if kb != nil {
		p["reply_markup"] = replyMarkup{InlineKeyboard: kb}
	}
	return c.call("editMessageText", p, nil)
}

// SendDocument uploads a file (reports, evidence).
func (c *Client) SendDocument(chatID int64, filename string, mime string, data []byte, caption string) (int64, error) {
	if c.Token == "" {
		return 0, fmt.Errorf("telegram: no token")
	}
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("chat_id", fmt.Sprintf("%d", chatID))
	_ = w.WriteField("caption", caption)
	fw, _ := w.CreateFormFile("document", filename)
	if mime != "" {
		// mime sniffing is handled by telegram; filename ext is enough
		_ = mime
	}
	_, _ = fw.Write(data)
	_ = w.Close()
	resp, err := c.HC.Post(c.apiBase()+"/bot"+c.Token+"/sendDocument", w.FormDataContentType(), &buf)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var ar struct {
		OK     bool    `json:"ok"`
		Result Message `json:"result"`
		Desc   string  `json:"description"`
	}
	if err := json.Unmarshal(raw, &ar); err != nil {
		return 0, err
	}
	if !ar.OK {
		return 0, fmt.Errorf("sendDocument: %s", ar.Desc)
	}
	return ar.Result.MessageID, nil
}

// AnswerCallbackQuery closes the little spinner on a button tap.
func (c *Client) AnswerCallbackQuery(id, text string) error {
	return c.call("answerCallbackQuery", map[string]any{"callback_query_id": id, "text": text}, nil)
}

// GetUpdates long-polls (timeout seconds). offset = last update_id + 1.
func (c *Client) GetUpdates(offset int64, timeoutSec int) ([]Update, error) {
	v := url.Values{}
	v.Set("timeout", fmt.Sprintf("%d", timeoutSec))
	v.Set("offset", fmt.Sprintf("%d", offset))
	v.Set("allowed_updates", `["message","callback_query"]`)
	resp, err := c.HC.Post(c.apiBase()+"/bot"+c.Token+"/getUpdates", "application/x-www-form-urlencoded", strings.NewReader(v.Encode()))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var ar struct {
		OK     bool     `json:"ok"`
		Result []Update `json:"result"`
		Desc   string   `json:"description"`
	}
	if err := json.Unmarshal(raw, &ar); err != nil {
		return nil, err
	}
	if !ar.OK {
		return nil, fmt.Errorf("getUpdates: %s", ar.Desc)
	}
	return ar.Result, nil
}
