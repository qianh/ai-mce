import type { SaveResult } from '../../../lib/types';

interface Props {
  storageState?: SaveResult['storage_state'];
  uploadError?: SaveResult['upload_error'];
}

export default function SuccessScreen({ storageState, uploadError }: Props) {
  const isLocalFallback = storageState === 'local' && Boolean(uploadError);
  const isCloud = storageState === 'cloud';
  const title = isLocalFallback
    ? '✓ 已保存到本地'
    : isCloud
      ? '✓ 已保存到云端 AI Memory'
      : '✓ 已保存到 AI Memory';
  const description = isLocalFallback
    ? '云端暂未写入，已保留本地数据，可稍后上传云端或在控制台删除。'
    : isCloud
      ? '对话已写入云端数据库，并保留本地索引。'
      : '对话原文已写入本地 SQLite';

  return (
    <div className="scr" style={{ width: 392, padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-display)', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 16 }}>
        {description}
      </div>
      <button
        onClick={() => chrome.runtime.openOptionsPage()}
        style={{ width: '100%', padding: '10px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600 }}
      >
        查看控制台 →
      </button>
    </div>
  );
}
