// Package bot — bridge: the D1 message bus between the panel terminal (TS
// worker) and the Go daemon. The worker writes bridge_inbox rows; flashd
// polls them, executes through the SAME router as Telegram, replies into
// bridge_outbox (the panel terminal polls it back) and mirrors to Telegram.
package bot

import (
	"fmt"
	"log"
	"time"
)

// D1 is the database surface the bridge needs (satisfied by *cfapi.Client
// and by the test fake — clean seam, no network in unit tests).
type D1 interface {
	Query(dbID, sql string, params ...any) (rows []map[string]any, err error)
	Exec(dbID, sql string, params ...any) error
}

// Bridge is the D1 bus loop.
type Bridge struct {
	Eng    *Engine
	DB     D1
	DBID   string
	LastID int64
}

// NewBridge builds the bridge loop over the cfapi client.
func NewBridge(eng *Engine, cf D1, dbID string) *Bridge {
	return &Bridge{Eng: eng, DB: cf, DBID: dbID}
}

// primeOutbox reads the current max outbox id so old rows never replay.
func (b *Bridge) primeOutbox() {
	rows, err := b.DB.Query(b.DBID, "SELECT COALESCE(MAX(id),0) AS m FROM bridge_outbox")
	if err == nil && len(rows) > 0 {
		if v, ok := rows[0]["m"].(float64); ok {
			b.LastID = int64(v)
		}
	}
}

// Run polls forever (call in a goroutine).
func (b *Bridge) Run() {
	b.primeOutbox()
	tick := time.NewTicker(1500 * time.Millisecond)
	defer tick.Stop()
	for range tick.C {
		b.Once()
	}
}

// Once drains up to 5 pending commands.
func (b *Bridge) Once() {
	rows, err := b.DB.Query(b.DBID, "SELECT id, cmd FROM bridge_inbox WHERE done=0 ORDER BY id ASC LIMIT 5")
	if err != nil || len(rows) == 0 {
		return
	}
	var doneIDs []int64
	for _, r := range rows {
		var id int64
		var cmd string
		if v, ok := r["id"].(float64); ok {
			id = int64(v)
		}
		if v, ok := r["cmd"].(string); ok {
			cmd = v
		}
		if id == 0 || cmd == "" {
			continue
		}
		reply := b.Eng.Handle(-1, cmd) // -1 = bridge (admin by construction)
		doneIDs = append(doneIDs, id)
		b.Push(reply)
		// mirror the exchange to the admin on Telegram
		if b.Eng.Cfg != nil && b.Eng.Cfg.AdminChat > 0 && b.Eng.TG != nil && b.Eng.TG.Token != "" {
			notice := fmt.Sprintf("🖥 <b>ترمینال فلش</b>: <code>%s</code>", cmd)
			if _, err := b.Eng.TG.SendMessage(b.Eng.Cfg.AdminChat, notice, nil); err != nil {
				log.Printf("[bridge] tg mirror: %v", err)
			}
			if _, err := b.Eng.TG.SendMessage(b.Eng.Cfg.AdminChat, reply, nil); err != nil {
				log.Printf("[bridge] tg mirror reply: %v", err)
			}
		}
	}
	for _, id := range doneIDs {
		_ = b.DB.Exec(b.DBID, "UPDATE bridge_inbox SET done=1 WHERE id=?", id)
	}
}

// Push appends a reply to the outbox.
func (b *Bridge) Push(text string) {
	if text == "" {
		return
	}
	_ = b.DB.Exec(b.DBID, "INSERT INTO bridge_outbox (ts, text, kind) VALUES (?, ?, 'msg')",
		time.Now().UnixMilli(), text)
}
