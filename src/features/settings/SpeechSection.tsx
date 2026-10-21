import { ChevronsUpDown, Volume2 } from 'lucide-react';
import { useMemo } from 'react';
import { componentGeometry } from '../../design/tokens';
import { useI18n } from '../../i18n';
import {
  Button,
  ListGroup,
  ListItem,
  ListRow,
  Menu,
  MenuItem,
  MenuTrigger,
  Slider,
  toast,
} from '../../ui';
import {
  isSpeechAvailable,
  setSpeechPreferences,
  speakGerman,
  SPEECH_RATE,
  useGermanVoices,
  useSpeechPreferences,
} from '../speech';
import styles from './SettingsPage.module.css';

/** 试听用的德语句子（与界面语言无关） */
const PREVIEW_SENTENCE = 'Guten Tag! Ich lerne Deutsch.';
/** 菜单中“自动”的键；voiceURI 不会是这个值 */
const AUTOMATIC_VOICE = 'automatic:';
const RATE_FRACTION_DIGITS = 1;

/** 发音（F-086）：语速、德语语音与试听 */
export function SpeechSection() {
  const { locale, messages } = useI18n();
  const text = messages.settings.speech;
  const preferences = useSpeechPreferences();
  const voices = useGermanVoices();
  const rateFormat = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: RATE_FRACTION_DIGITS,
        maximumFractionDigits: RATE_FRACTION_DIGITS,
      }),
    [locale],
  );

  if (!isSpeechAvailable()) {
    return (
      <ListGroup header={text.header}>
        <ListRow title={text.unavailable} className={styles.placeholder} />
      </ListGroup>
    );
  }

  const save = (patch: Parameters<typeof setSpeechPreferences>[0]): void => {
    if (!setSpeechPreferences(patch)) toast.error({ title: text.notSaved });
  };
  const selected = voices.find((voice) => voice.voiceURI === preferences.voiceUri);
  const selectedName = selected?.name ?? text.automatic;

  return (
    <ListGroup header={text.header} footer={text.footer}>
      <ListItem>
        <Slider
          label={text.rate}
          minValue={SPEECH_RATE.min}
          maxValue={SPEECH_RATE.max}
          step={SPEECH_RATE.step}
          value={preferences.rate}
          onChange={(rate) => {
            save({ rate });
          }}
          formatValue={(rate) => text.rateValue(rateFormat.format(rate))}
        />
      </ListItem>
      <ListRow
        title={text.voice}
        trailing={
          voices.length === 0 ? (
            <span className={styles.value}>{text.noVoices}</span>
          ) : (
            <MenuTrigger>
              <Button
                size="sm"
                variant="plain"
                aria-label={text.voiceLabel(selectedName)}
                trailingIcon={<ChevronsUpDown size={componentGeometry.iconSm} aria-hidden />}
              >
                {selectedName}
              </Button>
              <Menu
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[selected?.voiceURI ?? AUTOMATIC_VOICE]}
                onSelectionChange={(keys) => {
                  if (keys === 'all') return;
                  const [key] = keys;
                  if (key === undefined) return;
                  save({ voiceUri: key === AUTOMATIC_VOICE ? null : String(key) });
                }}
              >
                <MenuItem id={AUTOMATIC_VOICE}>{text.automatic}</MenuItem>
                {voices.map((voice) => (
                  <MenuItem key={voice.voiceURI} id={voice.voiceURI}>
                    {text.voiceName(voice.name, voice.lang)}
                  </MenuItem>
                ))}
              </Menu>
            </MenuTrigger>
          )
        }
      />
      <ListRow
        title={text.preview}
        leading={<Volume2 size={componentGeometry.iconMd} />}
        className={styles.action}
        onAction={() => {
          speakGerman(PREVIEW_SENTENCE);
        }}
      />
    </ListGroup>
  );
}
