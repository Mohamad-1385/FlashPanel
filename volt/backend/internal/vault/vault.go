// Package vault reads/writes the encrypted credential vault (the exact
// tokens.json format used across the project — AES-256-GCM boxes), fully
// replacing the Node-side decryption with native Go.
package vault

import (
        "crypto/aes"
        "crypto/cipher"
        "crypto/rand"
        "encoding/hex"
        "encoding/json"
        "fmt"
        "os"
        "path/filepath"
        "strings"
)

// Box is one encrypted secret.
type Box struct {
        Box struct {
                IV   string `json:"iv"`
                Data string `json:"data"`
                Tag  string `json:"tag"`
        } `json:"box"`
}

// Vault maps owner-id → encrypted box.
type Vault map[string]Box

// Load reads a tokens.json file.
func Load(path string) (Vault, error) {
        b, err := os.ReadFile(path)
        if err != nil {
                return nil, err
        }
        var v Vault
        if err := json.Unmarshal(b, &v); err != nil {
                return nil, err
        }
        return v, nil
}

// ReadKeyFile reads the hex master key from .vault-key.
func ReadKeyFile(path string) ([]byte, error) {
        b, err := os.ReadFile(path)
        if err != nil {
                return nil, err
        }
        s := strings.TrimSpace(string(b))
        return hex.DecodeString(s)
}

// Decrypt opens one box with the master key.
func (v Vault) Decrypt(owner string, key []byte) (string, error) {
        box, ok := v[owner]
        if !ok {
                return "", fmt.Errorf("vault: no entry for %s", owner)
        }
        iv, err := hex.DecodeString(box.Box.IV)
        if err != nil {
                return "", err
        }
        data, err := hex.DecodeString(box.Box.Data)
        if err != nil {
                return "", err
        }
        tag, err := hex.DecodeString(box.Box.Tag)
        if err != nil {
                return "", err
        }
        block, err := aes.NewCipher(key)
        if err != nil {
                return "", err
        }
        gcm, err := cipher.NewGCM(block)
        if err != nil {
                return "", err
        }
        if len(iv) != gcm.NonceSize() {
                return "", fmt.Errorf("vault: iv size %d != %d", len(iv), gcm.NonceSize())
        }
        plain, err := gcm.Open(nil, iv, append(data, tag...), nil)
        if err != nil {
                return "", fmt.Errorf("vault: open failed (wrong key?)")
        }
        return string(plain), nil
}

// Encrypt seals a secret into a new box (for writing new vaults).
func Encrypt(owner, secret string, key []byte) (Vault, error) {
        block, err := aes.NewCipher(key)
        if err != nil {
                return nil, err
        }
        gcm, err := cipher.NewGCM(block)
        if err != nil {
                return nil, err
        }
        iv := make([]byte, gcm.NonceSize())
        if _, err := rand.Read(iv); err != nil {
                return nil, err
        }
        sealed := gcm.Seal(nil, iv, []byte(secret), nil)
        b := Box{}
        b.Box.IV = hex.EncodeToString(iv)
        b.Box.Data = hex.EncodeToString(sealed[:len(sealed)-16])
        b.Box.Tag = hex.EncodeToString(sealed[len(sealed)-16:])
        out := Vault{owner: b}
        return out, nil
}

// Save writes a vault file atomically.
func (v Vault) Save(path string) error {
        b, err := json.MarshalIndent(v, "", " ")
        if err != nil {
                return err
        }
        tmp := path + ".tmp"
        if err := os.WriteFile(tmp, b, 0o600); err != nil {
                return err
        }
        return os.Rename(tmp, path)
}

// WriteCFToken decrypts the shared flash vault (if present) and writes the
// plain CF token to volt/.cf-token (0600) — one-time setup, mirrored to /tmp.
func WriteCFToken(flashDir, voltDir, owner string) (string, error) {
        v, err := Load(filepath.Join(flashDir, "tokens.json"))
        if err != nil {
                return "", err
        }
        key, err := ReadKeyFile(filepath.Join(flashDir, ".vault-key"))
        if err != nil {
                return "", err
        }
        tok, err := v.Decrypt(owner, key)
        if err != nil {
                return "", err
        }
        p := filepath.Join(voltDir, ".cf-token")
        if err := os.WriteFile(p, []byte(tok), 0o600); err != nil {
                return "", err
        }
        _ = os.MkdirAll("/tmp/my-project/volt", 0o700)
        _ = os.WriteFile("/tmp/my-project/volt/.cf-token", []byte(tok), 0o600)
        return tok, nil
}
