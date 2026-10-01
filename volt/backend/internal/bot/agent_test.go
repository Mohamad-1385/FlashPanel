// Package bot tests — the rule-based Persian agent.
package bot

import (
	"strings"
	"testing"
)

func TestAgentFragment(t *testing.T) {
	out := Agent("فرگمنت چیست؟")
	if !strings.Contains(out, "mci") && !strings.Contains(out, "Handshake") {
		t.Fatalf("fragment answer wrong: %.80s", out)
	}
}

func TestAgentIPMode(t *testing.T) {
	if !strings.Contains(Agent("چطور ip ثابت کنم؟"), "ipmode") {
		t.Fatal("ip-mode answer wrong")
	}
}

func TestAgentArchitecture(t *testing.T) {
	out := Agent("معماری go این پنل چیه؟")
	if !strings.Contains(out, "voltd") && !strings.Contains(out, "Go") {
		t.Fatalf("arch answer wrong: %.80s", out)
	}
}

func TestAgentNoMatch(t *testing.T) {
	if Agent("zzz qqq xyz") != "" {
		t.Fatal("no-match must be empty")
	}
}

func TestAgentHelpListsTopics(t *testing.T) {
	if !strings.Contains(AgentHelp(), "فرگمنت") {
		t.Fatal("help must list topics")
	}
}
