import { useEffect, useState } from 'react';
import type { ExtractedConversation, SaveResult, SensitiveResult } from '../../lib/types';
import { dedupeSensitiveMatches, detectSensitive, parseSensitiveResult } from '../../lib/sensitive';
import SaveScreen from './screens/SaveScreen';
import DegradedScreen from './screens/DegradedScreen';
import SuccessScreen from './screens/SuccessScreen';
import FailScreen from './screens/FailScreen';
import { getPagePlatform, type PagePlatformRoute } from './platform';
import '../../assets/tokens.css';

type Screen = 'loading' | 'waiting_id' | 'save' | 'degraded' | 'success' | 'fail';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [conversation, setConversation] = useState<ExtractedConversation | null>(null);
  const [sensitive, setSensitive] = useState<SensitiveResult | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) { setScreen('degraded'); return; }
      const route = getPagePlatform(tab.url);
      if (!route) { setScreen('degraded'); return; }

      // For ChatGPT: check conversationId first; if content script isn't running yet, fall through to extract anyway
      if (route.requiresConversationId) {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_CONVERSATION_ID' }, (res) => {
          if (chrome.runtime.lastError) {
            // Content script not injected yet — try extracting directly (will inject if needed)
            extractConversation(tab.id!, route);
            return;
          }
          if (!res?.conversationId) {
            // Script is running but no conversation started yet
            setScreen('waiting_id');
            return;
          }
          extractConversation(tab.id!, route);
        });
      } else {
        extractConversation(tab.id, route);
      }
    });
  }, []);

  const extractConversation = (tabId: number, route: PagePlatformRoute) => {
    const handleResult = (result: Record<string, unknown> | undefined) => {
      if (chrome.runtime.lastError || !result) { setScreen('degraded'); return; }
      if (result['type'] === 'EXTRACTION_RESULT') {
        const conv = result['conversation'] as ExtractedConversation;
        const detected = mergeSensitiveResults(
          parseSensitiveResult(result['sensitive']),
          detectSensitive(conv.content.messages),
        );
        setConversation(conv);
        setSensitive(detected);
        setScreen(conv.extraction_quality.confidence < 0.6 ? 'degraded' : 'save');
      } else {
        setScreen('degraded');
      }
    };

    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONVERSATION' }, (result) => {
      if (chrome.runtime.lastError || !result) {
        chrome.scripting.executeScript(
          { target: { tabId }, files: [route.scriptFile] },
          () => {
            if (chrome.runtime.lastError) { setScreen('degraded'); return; }
            chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONVERSATION' }, handleResult);
          }
        );
        return;
      }
      handleResult(result);
    });
  };

  const handleSave = (conv: ExtractedConversation, confirmedSensitiveUpload = false) => {
    chrome.runtime.sendMessage(
      { type: 'SAVE_REQUEST', conversation: conv, confirmed_sensitive_upload: confirmedSensitiveUpload },
      (result: SaveResult | undefined) => {
        if (chrome.runtime.lastError || !result) {
          setErrorMsg('保存失败，请重试');
          setScreen('fail');
          return;
        }
        if (result.success) {
          setSaveResult(result);
          setScreen('success');
        } else {
          setErrorMsg(result.error === 'DUPLICATE' ? '此内容已保存过' : '保存失败，请重试');
          setScreen('fail');
        }
      }
    );
  };

  const openConsole = () => chrome.runtime.openOptionsPage();

  const renderScreen = () => {
    if (screen === 'loading') return <div style={{ padding: 24, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-3)' }}>正在识别页面…</div>;
    if (screen === 'waiting_id') return (
      <div style={{ padding: 24, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-3)', textAlign: 'center' }}>
        <div style={{ fontSize: 20, marginBottom: 8 }}>⏳</div>
        <div style={{ fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>等待对话初始化…</div>
        <div>请等待 AI 开始回复后再保存</div>
      </div>
    );
    if (screen === 'save' && conversation) return <SaveScreen conversation={conversation} sensitive={sensitive} onSave={handleSave} onOpenConsole={openConsole} />;
    if (screen === 'degraded') return <DegradedScreen />;
    if (screen === 'success') return <SuccessScreen storageState={saveResult?.storage_state} uploadError={saveResult?.upload_error} />;
    if (screen === 'fail') return <FailScreen errorMessage={errorMsg} />;
    return null;
  };

  return (
    <div>
      {renderScreen()}
      {screen !== 'save' && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '8px 14px', display: 'flex', justifyContent: 'flex-end', background: 'var(--surface-2)' }}>
          <button
            onClick={openConsole}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
          >
            控制台 ↗
          </button>
        </div>
      )}
    </div>
  );
}

function mergeSensitiveResults(primary: SensitiveResult | null, fallback: SensitiveResult): SensitiveResult {
  if (!primary) return fallback;

  const matches = dedupeSensitiveMatches([...primary.matches, ...fallback.matches]);
  return { has_sensitive: matches.length > 0, matches };
}
