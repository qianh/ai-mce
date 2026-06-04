import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbInit } from '../../../db/bridge';
import { listCaptures } from '../../../db/repos/captures';
import type { Capture } from '../../../lib/types';

export default function CaptureList() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [titleQuery, setTitleQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    dbInit().then(() => listCaptures()).then((list) => { setCaptures(list); setLoading(false); });
  }, []);

  const platformOptions = Array.from(new Set(['chatgpt', 'deepseek', ...captures.map((c) => c.source_platform)]));
  const normalizedQuery = titleQuery.trim().toLowerCase();
  const filteredCaptures = captures.filter((capture) => {
    const platformMatches = platformFilter === 'all' || capture.source_platform === platformFilter;
    const titleMatches = !normalizedQuery || capture.source_title.toLowerCase().includes(normalizedQuery);
    return platformMatches && titleMatches;
  });
  const hasActiveFilters = platformFilter !== 'all' || normalizedQuery.length > 0;

  if (loading) return <div style={{ color: 'var(--ink-3)', paddingTop: 40, textAlign: 'center' }}>加载中…</div>;

  if (!captures.length) return (
    <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--ink-3)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)' }}>还没有保存记录</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>在 ChatGPT 点击插件图标，开始保存你的第一次对话</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
        Captures <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-3)' }}>· {filteredCaptures.length} / {captures.length} 条</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          aria-label="标题搜索"
          value={titleQuery}
          onChange={(event) => setTitleQuery(event.currentTarget.value)}
          onInput={(event) => setTitleQuery(event.currentTarget.value)}
          placeholder="搜索标题"
          style={{ height: 34, minWidth: 220, padding: '0 10px', border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--surface)', color: 'var(--ink-1)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
        />
        <select
          aria-label="渠道筛选"
          value={platformFilter}
          onChange={(event) => setPlatformFilter(event.currentTarget.value)}
          style={{ height: 34, padding: '0 10px', border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--surface)', color: 'var(--ink-1)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
        >
          <option value="all">全部渠道</option>
          {platformOptions.map((platform) => (
            <option key={platform} value={platform}>{platformLabel(platform)}</option>
          ))}
        </select>
      </div>
      {hasActiveFilters && !filteredCaptures.length ? (
        <div className="card" style={{ padding: 28, color: 'var(--ink-3)', textAlign: 'center', fontSize: 13 }}>
          没有匹配的记录
        </div>
      ) : (
      <div className="card" style={{ overflow: 'hidden' }}>
        {filteredCaptures.map((c, i) => (
          <div
            key={c.id}
            onClick={() => navigate(`/capture/${c.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < filteredCaptures.length - 1 ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.source_title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ border: '1px solid var(--line-2)', borderRadius: 5, padding: '1px 6px', color: 'var(--ink-2)', background: 'var(--surface-2)', fontWeight: 600 }}>
                  {platformLabel(c.source_platform)}
                </span>
                <span>{new Date(c.created_at).toLocaleString('zh-CN')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

function platformLabel(platform: string): string {
  if (platform === 'chatgpt') return 'ChatGPT';
  if (platform === 'deepseek') return 'DeepSeek';
  return platform;
}
