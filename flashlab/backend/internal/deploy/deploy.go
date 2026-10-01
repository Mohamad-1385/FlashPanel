// Package deploy — the FLASHLAB provisioning pipeline in Go (this used to be
// Node deploy scripts; now the whole backend toolchain speaks Go):
// D1 create → worker upload (multipart + bindings) → subdomain on →
// verify live → write flashlab/config.json + secrets.
package deploy

import (
        "crypto/rand"
        "encoding/hex"
        "encoding/json"
        "fmt"
        "os"
        "path/filepath"
        "strings"
        "time"

        "flashlab/internal/cfapi"
        "flashlab/internal/config"
)

// Result describes a finished deployment.
type Result struct {
        Worker string
        URL    string
        D1ID   string
        D1Name string
        Gate   string
        BotKey string
        TPatch string
}

func randHex(n int) string {
        b := make([]byte, n)
        _, _ = rand.Read(b)
        return hex.EncodeToString(b)
}

// Provision does the whole flow. workerName may be empty → generated.
func Provision(cf *cfapi.Client, flDir string, workerName string, adminChat int64) (*Result, error) {
        if workerName == "" {
                workerName = "flashlab-" + randHex(2)
        }
        fmt.Println("[deploy] 1/7 creating D1 database …")
        d1Name := "flashlab-store-" + randHex(3)
        d1ID, err := cf.CreateD1(d1Name)
        if err != nil {
                return nil, fmt.Errorf("d1 create: %w", err)
        }
        fmt.Println("[deploy]    D1:", d1Name, d1ID)

        fmt.Println("[deploy] 2/7 reading worker bundle …")
        src, err := os.ReadFile(filepath.Join(flDir, "worker/dist/worker.js"))
        if err != nil {
                return nil, fmt.Errorf("read worker.js: %w", err)
        }

        gate := randHex(8)
        botKey := "flk_" + randHex(14)
        tpath := randHex(7)

        fmt.Println("[deploy] 3/7 uploading worker", workerName, "…")
        bindings := []cfapi.Binding{
                {Type: "d1", Name: "DB", ID: d1ID},
                {Type: "plain_text", Name: "GATE", Text: gate},
                {Type: "plain_text", Name: "BOTKEY", Text: botKey},
                {Type: "plain_text", Name: "TPATH", Text: tpath},
        }
        if err := cf.DeployWorker(workerName, src, bindings, "2024-09-23"); err != nil {
                return nil, fmt.Errorf("worker upload: %w", err)
        }

        fmt.Println("[deploy] 4/6 enabling workers.dev subdomain …")
        if err := cf.EnableSubdomain(workerName); err != nil {
                return nil, fmt.Errorf("subdomain: %w", err)
        }

        // the panel login password = the admin claim code (one secret opens
        // both the panel gate and the bot admin claim)
        code := adminCode()
        fmt.Println("[deploy] 5/7 seeding D1 settings (panel password + defaults) …")
        if err := cf.Exec(d1ID, "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"); err != nil {
                return nil, fmt.Errorf("d1 settings schema: %w", err)
        }
        for k, v := range map[string]string{
                "panel_pass": code,
                "panel_name": "فلش",
                "adblock":    "1",
                "ip_mode":    "rotate",
        } {
                if err := cf.Exec(d1ID, "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", k, v); err != nil {
                        return nil, fmt.Errorf("d1 settings seed %s: %w", k, err)
                }
        }

        res := &Result{
                Worker: workerName,
                URL:    "https://" + workerName + "." + subdomainFor(cf),
                D1ID:   d1ID, D1Name: d1Name,
                Gate: gate, BotKey: botKey, TPatch: tpath,
        }

        fmt.Println("[deploy] 6/7 writing flashlab/config.json + secrets …")
        if err := writeConfig(flDir, res, cf, adminChat, code); err != nil {
                return nil, err
        }

        fmt.Println("[deploy] 7/7 done —", res.URL)
        return res, nil
}

func subdomainFor(cf *cfapi.Client) string {
        // the account's workers.dev subdomain (nasabaghili for this deployment)
        if v := os.Getenv("FLASHLAB_SUBDOMAIN"); v != "" {
                return v
        }
        return "nasabaghili.workers.dev"
}

func writeConfig(flDir string, res *Result, cf *cfapi.Client, adminChat int64, code string) error {
        cfg := config.Config{
                Panel: config.Deployment{
                        Name:       "FLASHLAB",
                        URL:        res.URL,
                        Worker:     res.Worker,
                        D1ID:       res.D1ID,
                        D1Name:     res.D1Name,
                        Gate:       res.Gate,
                        BotKey:     res.BotKey,
                        TPatch:     res.TPatch,
                        AccountID:  cf.AccountID,
                        DeployedAt: time.Now().UnixMilli(),
                },
                AdminChat:   adminChat,
                MonitorPort: "8017",
                UseBridge:   true,
        }
        b, _ := json.MarshalIndent(cfg, "", "  ")
        if err := os.WriteFile(filepath.Join(flDir, "config.json"), b, 0o600); err != nil {
                return err
        }
        _ = os.WriteFile(filepath.Join(flDir, ".admin-code"), []byte(code), 0o600)
        // /tmp vault mirror
        _ = os.MkdirAll("/tmp/my-project/flashlab", 0o700)
        _ = os.WriteFile("/tmp/my-project/flashlab/config.json", b, 0o600)
        _ = os.WriteFile("/tmp/my-project/flashlab/.admin-code", []byte(code), 0o600)
        return nil
}

func adminCode() string {
        parts := []string{"FLASHLAB"}
        for i := 0; i < 3; i++ {
                b := make([]byte, 2)
                _, _ = rand.Read(b)
                parts = append(parts, strings.ToUpper(hex.EncodeToString(b)))
        }
        return strings.Join(parts, "-")
}

// PushExisting re-uploads worker/dist/worker.js with the CURRENT config
// bindings (update flow — same D1, same gate/botkey/tpath, zero downtime).
func PushExisting(cf *cfapi.Client, flDir string) error {
        b, err := os.ReadFile(filepath.Join(flDir, "config.json"))
        if err != nil {
                return err
        }
        var cfg config.Config
        if err := json.Unmarshal(b, &cfg); err != nil {
                return err
        }
        src, err := os.ReadFile(filepath.Join(flDir, "worker/dist/worker.js"))
        if err != nil {
                return err
        }
        bindings := []cfapi.Binding{
                {Type: "d1", Name: "DB", ID: cfg.Panel.D1ID},
                {Type: "plain_text", Name: "GATE", Text: cfg.Panel.Gate},
                {Type: "plain_text", Name: "BOTKEY", Text: cfg.Panel.BotKey},
                {Type: "plain_text", Name: "TPATH", Text: cfg.Panel.TPatch},
        }
        return cf.DeployWorker(cfg.Panel.Worker, src, bindings, "2024-09-23")
}

// Teardown removes worker + D1 of the panel described by flashlab/config.json.
func Teardown(cf *cfapi.Client, flDir string) error {
        b, err := os.ReadFile(filepath.Join(flDir, "config.json"))
        if err != nil {
                return err
        }
        var cfg config.Config
        if err := json.Unmarshal(b, &cfg); err != nil {
                return err
        }
        if err := cf.DeleteWorker(cfg.Panel.Worker); err != nil {
                return fmt.Errorf("delete worker: %w", err)
        }
        if err := cf.DeleteD1(cfg.Panel.D1ID); err != nil {
                return fmt.Errorf("delete d1: %w", err)
        }
        return nil
}
