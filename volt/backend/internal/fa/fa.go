// Package fa — Persian text formatting (digits, bytes) shared across packages.
package fa

import (
	"fmt"
	"strings"
)

// Digits converts ASCII digits to Persian digits.
func Digits(s string) string {
	out := []rune(s)
	for i, r := range out {
		if r >= '0' && r <= '9' {
			out[i] = rune('۰' + (r - '0'))
		}
	}
	return string(out)
}

// Bytes renders bytes in a human Persian form with the Persian decimal mark.
func Bytes(n int64) string {
	const kb, mb, gb = 1 << 10, 1 << 20, 1 << 30
	f := func(v float64, unit string) string {
		s := fmt.Sprintf("%.1f", v)
		return Digits(strings.Replace(s, ".", "٫", 1)) + " " + unit
	}
	switch {
	case n >= gb:
		return f(float64(n)/float64(gb), "گیگابایت")
	case n >= mb:
		return f(float64(n)/float64(mb), "مگابایت")
	case n >= kb:
		return f(float64(n)/float64(kb), "کیلوبایت")
	default:
		return Digits(fmt.Sprintf("%d بایت", n))
	}
}
