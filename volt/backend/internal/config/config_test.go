// Package config tests — vault mirror restore + credential fallback.
package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMirrorRestore(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, ".bot-token")

	// simulate the /tmp vault holding the truth
	if err := os.WriteFile(tmpVault+"/"+filepath.Base(p), []byte("TOKEN-123"), 0o600); err != nil {
		t.Skip("vault write not permitted in this env")
	}
	defer os.Remove(tmpVault + "/" + filepath.Base(p))

	mirrorRestore(p)
	b, err := os.ReadFile(p)
	if err != nil || string(b) != "TOKEN-123" {
		t.Fatalf("mirrorRestore failed: %v %q", err, string(b))
	}
}

func TestLoadConfig(t *testing.T) {
	dir := t.TempDir()
	cfgJSON := `{"panel":{"name":"test","url":"https://x.example.workers.dev","worker":"x","d1_id":"d1","gate":"g","botkey":"vtk_x","tpath":"tp","account_id":"acc"},"admin_chat":42,"monitor_port":"9999"}`
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(cfgJSON), 0o600); err != nil {
		t.Fatal(err)
	}
	c, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.Panel.Gate != "g" || c.Panel.BotKey != "vtk_x" || c.AdminChat != 42 {
		t.Fatalf("panel fields wrong: %+v", c.Panel)
	}
	if c.MonitorPort != "9999" {
		t.Fatalf("monitor port = %s", c.MonitorPort)
	}
}
