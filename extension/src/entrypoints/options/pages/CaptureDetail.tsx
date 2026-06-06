import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deleteCapture, getCaptureById, getCaptureMessages, upsertCloudCaptureLink } from '../../../db/repos/captures';
import { getSettings, setSetting } from '../../../db/repos/settings';
import { createCloudApiClient, type CloudCaptureDetail } from '../../../lib/cloud-api';
import { uploadCaptureWithSessionRefresh } from '../../../lib/cloud-session';
import type { Capture, ExtractedConversation, MessageRole } from '../../../lib/types';

const ROLE_LABEL: Record<string, string> = {
  user: '你',
  assistant: 'AI',
  system: '系统',
  unknown: '?',
};

const ROLE_COLOR: Record<string, string> = {
  user: 'var(--accent)',
  assistant: 'var(--ok-fg)',
  system: 'var(--ink-3)',
  unknown: 'var(--ink-3)',
};

interface ParsedMessage {
  role: string;
  content: string;
  index: number;
}

const CLOUD_ID_PREFIX = 'cloud:';

function parseMessages(text: string): ParsedMessage[] {
  const lines = text.split('\n\n');
  return lines.map((block, i) => {
    const colonIdx = block.indexOf(': ');
    if (colonIdx === -1) return { role: 'unknown', content: block, index: i };
    return { role: block.slice(0, colonIdx), content: block.slice(colonIdx + 2), index: i };
  }).filter((m) => m.content.trim());
}

export default function CaptureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [capture, setCapture] = useState<Capture | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getCaptureById(id), getCaptureMessages(id), getSettings()]).then(async ([row, text, settings]) => {
      setCapture(row);
      const cloudOnlyId = id.startsWith(CLOUD_ID_PREFIX) ? id.slice(CLOUD_ID_PREFIX.length) : null;
      if (!row && cloudOnlyId && settings.cloud_access_token) {
        const detail = await createCloudApiClient(settings.api_base_url).getCapture(settings.cloud_access_token, cloudOnlyId);
        setCapture(cloudDetailToCapture(detail));
        setMessages(cloudMessagesToParsed(detail.messages));
        return;
      }
      if (text) {
        setMessages(parseMessages(text));
        return;
      }
      if (row?.storage_state === 'cloud' && row.cloud_capture_id && settings.cloud_access_token) {
        const detail = await createCloudApiClient(settings.api_base_url).getCapture(settings.cloud_access_token, row.cloud_capture_id);
        setMessages(cloudMessagesToParsed(detail.messages));
      }
    });
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    if (confirm('确认删除此 Capture？此操作不可撤销。')) {
      if (capture?.storage_state === 'cloud' && capture.cloud_capture_id) {
        const settings = await getSettings();
        if (settings.cloud_access_token) {
          await createCloudApiClient(settings.api_base_url).deleteCapture(settings.cloud_access_token, capture.cloud_capture_id);
        }
      }
      await deleteCapture(id);
      navigate('/');
    }
  };

  const handleUploadCloud = async () => {
    if (!capture || !messages.length) return;
    const settings = await getSettings();
    if (!settings.cloud_access_token) return;

    const conversation: ExtractedConversation = {
      schema_version: '1',
      extractor_version: 'manual-backfill',
      source: {
        platform: capture.source_platform as ExtractedConversation['source']['platform'],
        url: capture.source_url,
        browser_title: capture.source_title,
        captured_at: capture.created_at,
      },
      content: {
        title: capture.source_title,
        messages: messages.map((message) => ({
          role: message.role as MessageRole,
          content: message.content,
          index: message.index,
        })),
      },
      extraction_quality: capture.extraction_quality,
      hashes: {
        content_hash: capture.content_hash,
        message_hashes: [],
        source_fingerprint: capture.source_fingerprint || `${capture.source_platform}:${capture.id}`,
      },
      metadata: { manual_backfill: true },
    };

    const uploaded = await uploadCaptureWithSessionRefresh(settings.cloud_access_token, conversation, { getSettings, setSetting });
    await upsertCloudCaptureLink(conversation, uploaded.id, uploaded.updated_at);
    setCapture({ ...capture, storage_state: 'cloud', cloud_capture_id: uploaded.id, cloud_uploaded_at: uploaded.updated_at });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 13 }}>← 返回</button>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>对话原文</div>
        {capture && capture.storage_state !== 'cloud' && (
          <button onClick={handleUploadCloud} style={{ padding: '7px 13px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            上传云端
          </button>
        )}
        <button onClick={handleDelete} style={{ padding: '7px 13px', borderRadius: 7, border: '1px solid color-mix(in oklab, var(--danger-fg) 35%, transparent)', background: 'transparent', color: 'var(--danger-fg)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          删除
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((msg) => {
          const roleKey = msg.role in ROLE_LABEL ? msg.role : 'unknown';
          return (
            <div key={msg.index} className="card" style={{ padding: '13px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: 'color-mix(in oklab, ' + ROLE_COLOR[roleKey] + ' 12%, transparent)', color: ROLE_COLOR[roleKey], border: '1px solid color-mix(in oklab, ' + ROLE_COLOR[roleKey] + ' 30%, transparent)' }}>
                  {ROLE_LABEL[roleKey] ?? roleKey}
                </span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg.content}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--ink-3)', fontSize: 14 }}>暂无内容</div>
        )}
      </div>
    </div>
  );
}

function cloudMessagesToParsed(messages: CloudCaptureDetail['messages']): ParsedMessage[] {
  return messages.map((message, index) => ({
    role: message.role,
    content: message.content,
    index: message.index ?? index,
  }));
}

function cloudDetailToCapture(detail: CloudCaptureDetail): Capture {
  return {
    id: `${CLOUD_ID_PREFIX}${detail.id}`,
    source_platform: detail.source_platform,
    source_url: detail.source_url,
    source_title: detail.source_title,
    content_hash: detail.content_hash,
    source_fingerprint: detail.source_fingerprint,
    extraction_quality: detail.extraction_quality as unknown as Capture['extraction_quality'],
    status: 'saved',
    created_at: detail.created_at,
    storage_state: 'cloud',
    cloud_capture_id: detail.id,
    cloud_uploaded_at: detail.updated_at,
    upload_error: null,
  };
}
