package main

import (
    "fmt"
    "github.com/mce/scanner/internal/parser"
)

func main() {
    cp := parser.NewCodexParser()
    conv, err := cp.Parse("/Users/hong/.codex/sessions/2025/11/27/rollout-2025-11-27T23-57-17-019ac608-7fda-7061-9dac-5ebf03e4fc19.jsonl")
    if err != nil {
        fmt.Println("CODEX ERROR:", err)
    } else {
        fmt.Printf("CODEX OK: %d messages\n", len(conv.Content.Messages))
    }

    gp := parser.NewGrokParser()
    conv, err = gp.Parse("/Users/hong/.grok/sessions/%2FUsers%2Fhong/019e9ba7-48b2-7ce1-9f99-87880121a4cb")
    if err != nil {
        fmt.Println("GROK ERROR:", err)
    } else {
        fmt.Printf("GROK OK: %d messages\n", len(conv.Content.Messages))
    }

    op := parser.NewOpenCodeParser()
    conv, err = op.Parse("/Users/hong/.local/share/opencode/opencode.db::ses_44f28617dffeMWyLC7VFPOQM94")
    if err != nil {
        fmt.Println("OPENCODE ERROR:", err)
    } else {
        fmt.Printf("OPENCODE OK: %d messages\n", len(conv.Content.Messages))
    }
}
