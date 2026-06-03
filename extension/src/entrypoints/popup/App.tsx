import { useEffect, useState } from 'react';
import type { ExtractedConversation, SensitiveResult, ProgressStep } from '../../lib/types';
import SaveScreen from './screens/SaveScreen';
import DegradedScreen from './screens/DegradedScreen';
import SensitiveScreen from './screens/SensitiveScreen';
import SuccessScreen from './screens/SuccessScreen';
import FailScreen from './screens/FailScreen';
import '../../assets/tokens.css';

type Screen = 'loading' | 'save' | 'degraded' | 'sensitive' | 'success' | 'fail';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [conversation, setConversation] = useState<ExtractedConversation | null>(null);
  const [sensitive, setSensitive] = useState<SensitiveResult | null>(null);
  const [captureId, setCaptureId] = useState('');
  const [progress, setProgress] = useState<ProgressStep[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) { setScreen('degraded'); return; }
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONVERSATION' }, (result) => {
        if (chrome.runtime.lastError || !result) { setScreen('degraded'); return; }
        if (result.type === 'EXTRACTION_RESULT') {
          setConversation(result.conversation as ExtractedConversation);
          setSensitive(result.sensitive as SensitiveResult);
          if ((result.conversation as ExtractedConversation).extraction_quality.confidence < 0.6) {
            setScreen('degraded');
          } else if ((result.sensitive as SensitiveResult).has_sensitive) {
            setScreen('sensitive');
          } else {
            setScreen('save');
          }
        } else {
          setScreen('degraded');
        }
      });
    });

    const listener = (msg: Record<string, unknown>) => {
      if (msg['type'] === 'PROGRESS_UPDATE') {
        setProgress((prev) => [...prev, msg['step'] as ProgressStep]);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleSave = (conv: ExtractedConversation) => {
    chrome.runtime.sendMessage(
      { type: 'SAVE_REQUEST', conversation: conv, save_mode: 'summary_and_memory' },
      (result: { success: boolean; capture_id?: string; error?: string }) => {
        if (result?.success && result.capture_id) {
          setCaptureId(result.capture_id);
          setScreen('success');
        } else {
          setErrorMsg(result?.error === 'DUPLICATE' ? '此内容已保存过' : '保存失败，请重试');
          setScreen('fail');
        }
      }
    );
  };

  if (screen === 'loading') return <div style={{ padding: 24, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-3)' }}>正在识别页面…</div>;
  if (screen === 'save' && conversation) return <SaveScreen conversation={conversation} onSave={handleSave} />;
  if (screen === 'degraded') return <DegradedScreen />;
  if (screen === 'sensitive' && conversation && sensitive) return <SensitiveScreen conversation={conversation} sensitive={sensitive} onSave={handleSave} />;
  if (screen === 'success') return <SuccessScreen captureId={captureId} progress={progress} />;
  if (screen === 'fail') return <FailScreen errorMessage={errorMsg} />;
  return null;
}
