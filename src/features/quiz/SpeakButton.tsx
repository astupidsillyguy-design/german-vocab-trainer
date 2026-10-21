import { Volume2 } from 'lucide-react';
import { componentGeometry } from '../../design/tokens';
import { useI18n } from '../../i18n';
import { Button, IconButton } from '../../ui';
import { isSpeechAvailable, speakGerman } from '../speech';

export interface SpeakButtonProps {
  /** 要朗读的德语 */
  readonly text: string;
  /** 只显示图标（列表行里使用），读屏标签为“朗读 …” */
  readonly iconOnly?: boolean;
}

/**
 * 发音按钮（F-086）：浏览器不支持语音合成时不显示。
 * 按下时不抢焦点：作答时手机键盘保持打开，回车仍然进入下一题。
 */
export function SpeakButton({ text, iconOnly = false }: SpeakButtonProps) {
  const { messages } = useI18n();
  if (!isSpeechAvailable()) return null;
  const icon = <Volume2 size={componentGeometry.iconSm} aria-hidden />;
  const speak = (): void => {
    speakGerman(text);
  };
  return iconOnly ? (
    <IconButton
      size="sm"
      variant="tinted"
      preventFocusOnPress
      icon={icon}
      label={messages.speech.speakWord(text)}
      onPress={speak}
    />
  ) : (
    <Button size="sm" variant="tinted" preventFocusOnPress leadingIcon={icon} onPress={speak}>
      {messages.speech.speak}
    </Button>
  );
}
