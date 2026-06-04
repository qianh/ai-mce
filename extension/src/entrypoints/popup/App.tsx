import { useEffect, useState } from 'react';
import type { ExtractedConversation, SensitiveResult } from '../../lib/types';
import SaveScreen from './screens/SaveScreen';
import DegradedScreen from './screens/DegradedScreen';
import SensitiveScreen from './screens/SensitiveScreen';
import SuccessScreen from './screens/SuccessScreen';
import FailScreen from './screens/FailScreen';
import '../../assets/tokens.css';

type Screen = 'loading' | 'waiting_id' | 'save' | 'degraded' | 'sensitive' | 'success' | 'fail';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [conversation, setConversation] = useState<ExtractedConversation | null>(null);
  const [sensitive, setSensitive] = useState<SensitiveResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) { setScreen('degraded'); return; }

      // First check if this is a ChatGPT tab with a conversationId
      const isChatGPT = tab.url?.includes('chatgpt.com');
      if (isChatGPT) {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_CONVERSATION_ID' }, (res) => {
          if (chrome.runtime.lastError || !res?.conversationId) {
            setScreen('waiting_id');
            return;
          }
          extractConversation(tab.id!);
        });
      } else {
        extractConversation(tab.id);
      }
    });
  }, []);

  const extractConversation = (tabId: number) => {
    const handleResult = (result: Record<string, unknown> | undefined) => {
      if (chrome.runtime.lastError || !result) { setScreen('degraded'); return; }
      if (result['type'] === 'EXTRACTION_RESULT') {
        const conv = result['conversation'] as ExtractedConversation;
        setConversation(conv);
        setSensitive(result['sensitive'] as SensitiveResult);
        setScreen(conv.extraction_quality.confidence < 0.6 ? 'degraded' : 'save');
      } else {
        setScreen('degraded');
      }
    };

    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONVERSATION' }, (result) => {
      if (chrome.runtime.lastError || !result) {
        chrome.scripting.executeScript(
          { target: { tabId }, files: ['content-scripts/chatgpt.js'] },
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

  const handleSave = (conv: ExtractedConversation) => {
    chrome.runtime.sendMessage(
      { type: 'SAVE_REQUEST', conversation: conv },
      (result: { success: boolean; capture_id?: string; error?: string }) => {
        if (result?.success) {
          setScreen('success');
        } else {
          setErrorMsg(result?.error === 'DUPLICATE' ? '此内容已保存过' : '保存失败，请重试');
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
    if (screen === 'save' && conversation) return <SaveScreen conversation={conversation} onSave={handleSave} onOpenConsole={openConsole} />;
    if (screen === 'degraded') return <DegradedScreen />;
    if (screen === 'sensitive' && conversation && sensitive) return <SensitiveScreen conversation={conversation} sensitive={sensitive} onSave={handleSave} />;
    if (screen === 'success') return <SuccessScreen />;
    if (screen === 'fail') return <FailScreen errorMessage={errorMsg} />;
    return null;
  };

  return <div>{renderScreen()}</div>;
}
