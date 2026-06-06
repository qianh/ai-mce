import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deleteCapture, getCaptureById, getCaptureMessages, upsertCloudCaptureLink } from '../../../db/repos/captures';
import { getSettings, setSetting } from '../../../db/repos/settings';
import type { CloudCaptureDetail } from '../../../lib/cloud-api';
import {
  deleteCaptureWithSessionRefresh,
  getCaptureWithSessionRefresh,
  uploadCaptureWithSessionRefresh,
} from '../../../lib/cloud-session';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const cloudSessionDeps = { getSettings, setSetting };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadCaptureDetail() {
      setLoadError(null);
      try {
        const [row, text, settings] = await Promise.all([getCaptureById(id!), getCaptureMessages(id!), getSettings()]);
        if (cancelled) return;

        setCapture(row);
        const cloudOnlyId = id!.startsWith(CLOUD_ID_PREFIX) ? id!.slice(CLOUD_ID_PREFIX.length) : null;
        const hasCloudSession = Boolean(settings.cloud_refresh_token);
        if (!row && cloudOnlyId && hasCloudSession) {
          const detail = await getCaptureWithSessionRefresh(cloudOnlyId, cloudSessionDeps);
          if (cancelled) return;
          setCapture(cloudDetailToCapture(detail));
          setMessages(cloudMessagesToParsed(detail.messages));
          return;
        }
        if (text) {
          setMessages(parseMessages(text));
          return;
        }
        if (row?.storage_state === 'cloud' && row.cloud_capture_id && hasCloudSession) {
          const detail = await getCaptureWithSessionRefresh(row.cloud_capture_id, cloudSessionDeps);
          if (cancelled) return;
          setMessages(cloudMessagesToParsed(detail.messages));
        }
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : '加载失败');
      }
    }

    void loadCaptureDetail();
    return () => { cancelled = true; };
  }, [id]);

  const handleDelete = async () => {
    if (!id || deleteBusy) return;
    if (confirm('确认删除此 Capture？此操作不可撤销。')) {
      setActionError(null);
      setDeleteBusy(true);
      try {
        if (capture?.storage_state === 'cloud' && capture.cloud_capture_id) {
          const settings = await getSettings();
          if (!settings.cloud_refresh_token) {
            setActionError('请先在设置页登录云端。');
            return;
          }
          await deleteCaptureWithSessionRefresh(capture.cloud_capture_id, cloudSessionDeps);
        }
        await deleteCapture(id);
        navigate('/');
      } catch (error) {
        setActionError(getErrorMessage(error, '删除失败'));
      } finally {
        setDeleteBusy(false);
      }
    }
  };

  const handleUploadCloud = async () => {
    if (!capture || !messages.length || uploadBusy) return;
    setActionError(null);
    setUploadBusy(true);

    try {
      const settings = await getSettings();
      if (!settings.cloud_refresh_token) {
        setActionError('请先在设置页登录云端。');
        return;
      }

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

      const uploaded = await uploadCaptureWithSessionRefresh(conversation, { getSettings, setSetting });
      await upsertCloudCaptureLink(conversation, uploaded.id, uploaded.updated_at);
      setCapture({ ...capture, storage_state: 'cloud', cloud_capture_id: uploaded.id, cloud_uploaded_at: uploaded.updated_at });
    } catch (error) {
      setActionError(getErrorMessage(error, '上传失败'));
    } finally {
      setUploadBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 13 }}>← 返回</button>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>对话原文</div>
        {capture && capture.storage_state !== 'cloud' && (
          <button disabled={uploadBusy} onClick={handleUploadCloud} style={{ padding: '7px 13px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: uploadBusy ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: uploadBusy ? 0.7 : 1 }}>
            {uploadBusy ? '上传中…' : '上传云端'}
          </button>
        )}
        <button disabled={deleteBusy} onClick={handleDelete} style={{ padding: '7px 13px', borderRadius: 7, border: '1px solid color-mix(in oklab, var(--danger-fg) 35%, transparent)', background: 'transparent', color: 'var(--danger-fg)', cursor: deleteBusy ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: deleteBusy ? 0.7 : 1 }}>
          {deleteBusy ? '删除中…' : '删除'}
        </button>
      </div>

      {loadError && (
        <div className="card" style={{ padding: '14px 16px', marginBottom: 14, color: 'var(--danger-fg)', fontSize: 13 }}>
          无法加载云端内容：{loadError}。请前往设置页重新登录后再试。
        </div>
      )}

      {actionError && (
        <div className="card" style={{ padding: '14px 16px', marginBottom: 14, color: 'var(--danger-fg)', fontSize: 13 }}>
          云端操作失败：{actionError}
        </div>
      )}

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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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
