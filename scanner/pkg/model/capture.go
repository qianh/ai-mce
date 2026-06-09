package model

type Source struct {
	Platform     string `json:"platform"`
	URL          string `json:"url"`
	BrowserTitle string `json:"browser_title"`
	CapturedAt   string `json:"captured_at"`
}

type ExtractedMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Index   int    `json:"index"`
}

type Content struct {
	Title    string             `json:"title"`
	Messages []ExtractedMessage `json:"messages"`
}

type ExtractionQuality struct {
	Confidence        float64  `json:"confidence"`
	Method            string   `json:"method"`
	Warnings          []string `json:"warnings"`
	MessageCount      int      `json:"message_count"`
	EmptyMessageCount int      `json:"empty_message_count"`
}

type Hashes struct {
	ContentHash       string   `json:"content_hash"`
	MessageHashes     []string `json:"message_hashes"`
	SourceFingerprint string   `json:"source_fingerprint"`
}

type ExtractedConversation struct {
	SchemaVersion     string            `json:"schema_version"`
	ExtractorVersion  string            `json:"extractor_version"`
	Source            Source            `json:"source"`
	Content           Content           `json:"content"`
	ExtractionQuality ExtractionQuality `json:"extraction_quality"`
	Hashes            Hashes            `json:"hashes"`
	Metadata          map[string]any    `json:"metadata,omitempty"`
}

type CaptureCreateRequest struct {
	Source            Source            `json:"source"`
	Content           Content           `json:"content"`
	ExtractionQuality ExtractionQuality `json:"extraction_quality"`
	Hashes            Hashes            `json:"hashes"`
	Metadata          map[string]any    `json:"metadata,omitempty"`
}

func (c *ExtractedConversation) ToCaptureCreateRequest() CaptureCreateRequest {
	return CaptureCreateRequest{
		Source:            c.Source,
		Content:           c.Content,
		ExtractionQuality: c.ExtractionQuality,
		Hashes:            c.Hashes,
		Metadata:          c.Metadata,
	}
}
