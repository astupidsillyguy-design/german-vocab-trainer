import {
  Archive,
  BookOpenText,
  Ellipsis,
  PencilLine,
  RotateCcw,
  Settings,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useState } from 'react';
import {
  componentGeometry,
  glassGroup,
  glassVariants,
  materials,
  radius,
  semanticColors,
  shadow,
  space,
  typeScale,
  type GlassVariant,
  type MaterialToken,
  type RadiusToken,
  type ShadowToken,
  type SpaceToken,
  type TypeStyleToken,
} from '../design/tokens';
import { spaceVar, typeClass } from '../design/cssVar';
import { WCAG_AA } from '../design/math/contrast';
import { LOCALE_NATIVE_NAMES, SUPPORTED_LOCALES, useI18n } from '../i18n';
import {
  AccordionGroup,
  AlertDialog,
  Badge,
  Button,
  Card,
  Checkbox,
  DialogTrigger,
  Disclosure,
  EmptyState,
  GLASS_TIER_PREFERENCES,
  GlassGroup,
  IconButton,
  KeyButton,
  ListGroup,
  ListRow,
  LiquidGlass,
  Menu,
  MenuItem,
  MenuTrigger,
  NavigationBar,
  Popover,
  PopoverTrigger,
  ProgressBar,
  SearchField,
  SegmentedControl,
  Sheet,
  SheetTrigger,
  Sidebar,
  Slider,
  Spinner,
  Surface,
  Switch,
  TabBar,
  TextArea,
  TextField,
  toast,
  useGlass,
  type ButtonVariant,
  type Tone,
} from '../ui';
import { colorSwatches } from './colorTokens';
import { GallerySection } from './GallerySection';
import { MotionLabSection } from './MotionLab';
import styles from './DesignGallery.module.css';

const BUTTON_VARIANTS = [
  'glass',
  'filled',
  'tinted',
  'plain',
  'destructive',
] as const satisfies readonly ButtonVariant[];
const TONES = [
  'neutral',
  'tint',
  'success',
  'danger',
  'warning',
] as const satisfies readonly Tone[];
const SPECIAL_CHARACTERS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'] as const;
const SPEECH_RATE = { min: 0.5, max: 1.5, step: 0.1, initial: 0.9, fractionDigits: 1 } as const;
const PROGRESS_DEMO = { value: 12, max: 30 } as const;
const DEMO_WORD_COUNT = 24;
const DEMO_LESSON_COUNT = 3;
const CONTRAST_DIGITS = 2;

const typeTokens = Object.keys(typeScale) as TypeStyleToken[];
const radiusTokens = Object.keys(radius) as RadiusToken[];
const spaceTokens = (Object.keys(space) as SpaceToken[]).filter((token) => space[token] > 0);
const shadowTokens = Object.keys(shadow) as ShadowToken[];
const materialTokens = Object.keys(materials) as MaterialToken[];
const swatches = colorSwatches(semanticColors.light);

function ColorsSection() {
  const { messages } = useI18n();
  return (
    <GallerySection title={messages.gallery.sections.colors}>
      <ul className={styles.swatches}>
        {swatches.map((swatch) => (
          <li key={swatch.path} className={styles.swatch}>
            <span
              className={styles.swatchChip}
              style={{ background: `var(${swatch.cssVar})` }}
              aria-hidden
            />
            <span className={styles.swatchName}>{swatch.path}</span>
            <code className={styles.swatchValue}>{swatch.value}</code>
            {swatch.contrast !== null && (
              <Badge
                size="sm"
                tone={swatch.contrast >= WCAG_AA.normalText ? 'success' : 'warning'}
                className={styles.swatchBadge}
              >
                {messages.gallery.contrast(swatch.contrast.toFixed(CONTRAST_DIGITS))}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </GallerySection>
  );
}

function TokensSections() {
  const { messages } = useI18n();
  const sections = messages.gallery.sections;
  return (
    <>
      <GallerySection title={sections.typography}>
        <div className={styles.stack}>
          {typeTokens.map((token) => (
            <p key={token} className={typeClass(token)}>
              <span className={styles.tokenLabel}>{token}</span> {messages.gallery.sample}
            </p>
          ))}
        </div>
      </GallerySection>

      <GallerySection title={sections.radius}>
        <div className={styles.tiles}>
          {radiusTokens.map((token) => (
            <Surface
              key={token}
              material="thick"
              radius={token}
              elevation={1}
              className={styles.tile}
            >
              <span className={styles.tokenLabel}>{`${token} · ${String(radius[token])}`}</span>
            </Surface>
          ))}
          <Surface material="thick" radius="capsule" elevation={1} className={styles.capsuleTile}>
            <span className={styles.tokenLabel}>capsule</span>
          </Surface>
        </div>
      </GallerySection>

      <GallerySection title={sections.spacing}>
        <ul className={styles.stack}>
          {spaceTokens.map((token) => (
            <li key={token} className={styles.spaceRow}>
              <span className={styles.tokenLabel}>{`${token} · ${String(space[token])}`}</span>
              <span
                className={styles.spaceBar}
                style={{ inlineSize: spaceVar(token) }}
                aria-hidden
              />
            </li>
          ))}
        </ul>
      </GallerySection>

      <GallerySection title={sections.shadows}>
        <div className={styles.tiles}>
          {shadowTokens.map((token) => (
            <Surface
              key={token}
              material="thick"
              radius="lg"
              elevation={token}
              className={styles.tile}
            >
              <span className={styles.tokenLabel}>{token}</span>
            </Surface>
          ))}
        </div>
      </GallerySection>

      <GallerySection title={sections.materials}>
        <div className={styles.materialStage}>
          {materialTokens.map((token) => (
            <Surface key={token} material={token} radius="xl" className={styles.materialTile}>
              <span className={styles.materialName}>{token}</span>
              <span className={styles.tokenLabel}>{messages.gallery.sample}</span>
            </Surface>
          ))}
        </div>
      </GallerySection>
    </>
  );
}

function ButtonsSection() {
  const { messages } = useI18n();
  const variants = messages.gallery.variants;
  return (
    <GallerySection title={messages.gallery.sections.buttons}>
      <div className={styles.row}>
        {BUTTON_VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variants[variant]}
          </Button>
        ))}
      </div>
      <div className={styles.row}>
        <Button variant="filled" size="sm">
          {variants.small}
        </Button>
        <Button variant="filled" size="lg">
          {variants.large}
        </Button>
        <Button variant="filled" isPending>
          {variants.pending}
        </Button>
        <Button variant="filled" isDisabled>
          {variants.disabled}
        </Button>
        <IconButton
          label={messages.gallery.menuSpeak}
          icon={<Volume2 size={componentGeometry.iconMd} />}
        />
        <IconButton
          label={messages.gallery.menuRestart}
          size="sm"
          variant="tinted"
          icon={<RotateCcw size={componentGeometry.iconSm} />}
        />
      </div>
    </GallerySection>
  );
}

function InputsSection() {
  const { messages } = useI18n();
  const gallery = messages.gallery;
  const [answer, setAnswer] = useState('');
  return (
    <GallerySection title={gallery.sections.inputs}>
      <div className={styles.columns}>
        <div className={styles.stack}>
          <TextField
            label={gallery.answerLabel}
            description={gallery.answerDescription}
            value={answer}
            onChange={setAnswer}
            inputLang="de"
            autoCapitalize="none"
            size="xl"
            isClearable
          />
          <div className={styles.keys} role="group" aria-label={gallery.specialKeys}>
            {SPECIAL_CHARACTERS.map((character) => (
              <KeyButton
                key={character}
                character={character}
                onInsert={(inserted) => {
                  setAnswer((previous) => previous + inserted);
                }}
              />
            ))}
          </div>
          <TextField
            label={gallery.answerLabel}
            defaultValue="Schrank"
            errorMessage={gallery.answerError}
            isInvalid
          />
        </div>
        <div className={styles.stack}>
          <SearchField label={gallery.searchLabel} placeholder={gallery.searchPlaceholder} />
          <TextArea label={gallery.notesLabel} monospace rows={4} />
        </div>
      </div>
    </GallerySection>
  );
}

function SelectionSection() {
  const { messages } = useI18n();
  const gallery = messages.gallery;
  const [mode, setMode] = useState<'full' | 'selective'>('full');
  const [rate, setRate] = useState<number>(SPEECH_RATE.initial);
  return (
    <GallerySection title={gallery.sections.selection}>
      <div className={styles.columns}>
        <div className={styles.stack}>
          <Switch defaultSelected>{gallery.switchLabel}</Switch>
          <Switch isDisabled>{gallery.variants.disabled}</Switch>
          <Checkbox defaultSelected>{gallery.checkboxLabel}</Checkbox>
          <Checkbox isIndeterminate>{gallery.checkboxLabel}</Checkbox>
          <Checkbox isDisabled>{gallery.variants.disabled}</Checkbox>
        </div>
        <div className={styles.stack}>
          <SegmentedControl
            label={gallery.segmentedLabel}
            items={[
              { id: 'full', label: gallery.segmentedFull },
              { id: 'selective', label: gallery.segmentedSelective },
            ]}
            selectedKey={mode}
            onSelectionChange={setMode}
          />
          <Slider
            label={gallery.sliderLabel}
            minValue={SPEECH_RATE.min}
            maxValue={SPEECH_RATE.max}
            step={SPEECH_RATE.step}
            value={rate}
            onChange={(value) => {
              setRate(value);
            }}
            formatValue={(value) => `${value.toFixed(SPEECH_RATE.fractionDigits)}×`}
          />
        </div>
      </div>
    </GallerySection>
  );
}

function OverlaysSection() {
  const { messages } = useI18n();
  const gallery = messages.gallery;
  const showArchived = (): void => {
    toast.success({
      title: gallery.toastTitle,
      description: gallery.toastDescription,
      action: { label: messages.common.undo, onAction: () => undefined },
    });
  };

  return (
    <GallerySection title={gallery.sections.overlays}>
      <div className={styles.row}>
        <MenuTrigger>
          <IconButton
            label={gallery.menuLabel}
            icon={<Ellipsis size={componentGeometry.iconMd} />}
          />
          <Menu>
            <MenuItem icon={<RotateCcw size={componentGeometry.iconMd} />}>
              {gallery.menuRestart}
            </MenuItem>
            <MenuItem icon={<Volume2 size={componentGeometry.iconMd} />}>
              {gallery.menuSpeak}
            </MenuItem>
            <MenuItem icon={<Trash2 size={componentGeometry.iconMd} />} isDestructive>
              {gallery.menuDelete}
            </MenuItem>
          </Menu>
        </MenuTrigger>

        <PopoverTrigger>
          <Button variant="tinted">{gallery.popoverTrigger}</Button>
          <Popover title={gallery.popoverTitle}>
            <ul className={styles.popoverList}>
              <li lang="de">der Schrank</li>
              <li lang="de">die Kommode</li>
            </ul>
          </Popover>
        </PopoverTrigger>

        <DialogTrigger>
          <Button variant="destructive" leadingIcon={<Trash2 size={componentGeometry.iconMd} />}>
            {gallery.dialogTrigger}
          </Button>
          <AlertDialog
            title={gallery.dialogTitle}
            confirmLabel={messages.common.delete}
            tone="destructive"
            onConfirm={showArchived}
          >
            {gallery.dialogMessage}
          </AlertDialog>
        </DialogTrigger>

        <SheetTrigger>
          <Button>{gallery.sheetTrigger}</Button>
          <Sheet title={gallery.sheetTitle}>
            <div className={styles.stack}>
              <p>{gallery.sheetBody}</p>
              <ListGroup header={gallery.listHeader} headingLevel={3}>
                <ListRow title={gallery.listVoice} trailing={gallery.listVoiceValue} />
                <ListRow title={gallery.listTest} onAction={showArchived} showChevron />
              </ListGroup>
            </div>
          </Sheet>
        </SheetTrigger>

        <Button variant="filled" onPress={showArchived}>
          {gallery.toastTrigger}
        </Button>
        <Button
          variant="glass"
          onPress={() => {
            toast.error({ title: gallery.answerError });
          }}
        >
          {gallery.tones.danger}
        </Button>
      </div>
    </GallerySection>
  );
}

function NavigationSection() {
  const { messages } = useI18n();
  const items = [
    {
      id: 'quiz',
      label: messages.nav.quiz,
      href: '#/quiz',
      icon: <PencilLine size={componentGeometry.iconLg} />,
    },
    {
      id: 'archive',
      label: messages.nav.archive,
      href: '#/archive',
      icon: <Archive size={componentGeometry.iconLg} />,
      badge: DEMO_LESSON_COUNT,
    },
    {
      id: 'words',
      label: messages.nav.wordList,
      href: '#/words',
      icon: <BookOpenText size={componentGeometry.iconLg} />,
    },
    {
      id: 'settings',
      label: messages.nav.settings,
      href: '#/settings',
      icon: <Settings size={componentGeometry.iconLg} />,
    },
  ] as const;

  return (
    <GallerySection title={messages.gallery.sections.navigation}>
      <div className={styles.columns}>
        <TabBar
          label={messages.gallery.tabBarDemo}
          items={items}
          activeId="quiz"
          placement="inline"
        />
        <div className={styles.sidebarStage}>
          <Sidebar
            label={messages.gallery.sidebarDemo}
            header={messages.meta.appName}
            placement="inline"
            activeId="archive"
            sections={[
              {
                id: 'demo',
                items: items.map((item) => ({
                  id: item.id,
                  label: item.label,
                  href: item.href,
                  icon: item.icon,
                  ...(item.id === 'archive' ? { count: DEMO_WORD_COUNT } : {}),
                })),
              },
            ]}
          />
        </div>
      </div>
    </GallerySection>
  );
}

function ContentSection() {
  const { messages } = useI18n();
  const gallery = messages.gallery;
  return (
    <GallerySection title={gallery.sections.content}>
      <div className={styles.columns}>
        <div className={styles.stack}>
          <Card
            title={gallery.cardTitle}
            subtitle={gallery.cardSubtitle}
            headingLevel={3}
            accessory={<Badge tone="tint">{gallery.wordCount(DEMO_WORD_COUNT)}</Badge>}
          >
            <ProgressBar
              label={gallery.progressLabel}
              value={PROGRESS_DEMO.value}
              maxValue={PROGRESS_DEMO.max}
              valueLabel={`${String(PROGRESS_DEMO.value)} / ${String(PROGRESS_DEMO.max)}`}
            />
          </Card>
          <ListGroup header={gallery.listHeader} footer={gallery.listFooter} headingLevel={3}>
            <ListRow
              title={gallery.listVoice}
              leading={<Volume2 size={componentGeometry.iconMd} />}
              trailing={gallery.listVoiceValue}
            />
            <ListRow title={gallery.listTest} onAction={() => undefined} showChevron />
            <ListRow title={messages.nav.settings} href="#/settings" />
          </ListGroup>
          <div className={styles.row}>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {gallery.tones[tone]}
              </Badge>
            ))}
          </div>
          <div className={styles.row}>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone} variant="solid" size="sm">
                {DEMO_LESSON_COUNT}
              </Badge>
            ))}
          </div>
        </div>
        <div className={styles.stack}>
          <AccordionGroup defaultExpandedKeys={['chapter-1']}>
            <Disclosure
              id="chapter-1"
              title={gallery.disclosureTitle}
              subtitle={gallery.disclosureSubtitle}
              accessory={<Badge size="sm">{DEMO_WORD_COUNT}</Badge>}
            >
              <p>{gallery.disclosureBody}</p>
            </Disclosure>
            <Disclosure
              id="chapter-2"
              title={gallery.disclosureSecondTitle}
              subtitle={gallery.disclosureSubtitle}
            >
              <p>{gallery.disclosureBody}</p>
            </Disclosure>
          </AccordionGroup>
          <Surface material="regular" radius="xl">
            <EmptyState
              icon={<Archive size={componentGeometry.iconLg} />}
              title={gallery.emptyTitle}
              description={gallery.emptyDescription}
              headingLevel={3}
            />
          </Surface>
          <div className={styles.row}>
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </div>
        </div>
      </div>
    </GallerySection>
  );
}

/**
 * 设计系统一览（开发模式下访问 #/__design）。
 * 展示所有 token 与组件的全部状态，同时作为 e2e 可访问性与键盘测试的靶页。
 */
/** 玻璃实验室中可调的光学参数及其范围 */
const LAB_OPTICS = {
  refraction: { min: 0, max: 40, step: 1, unit: 'px' },
  bezel: { min: 4, max: 40, step: 1, unit: 'px' },
  dispersion: { min: 0, max: 1, step: 0.01, unit: '' },
  fresnel: { min: 0, max: 1, step: 0.01, unit: '' },
  specular: { min: 0, max: 1, step: 0.01, unit: '' },
} as const;
type LabOptic = keyof typeof LAB_OPTICS;
const LAB_OPTIC_KEYS = Object.keys(LAB_OPTICS) as LabOptic[];
const LAB_SPACING = { min: 0, max: 48, step: 1 } as const;
const LAB_GAP = { min: 0, max: 64, step: 1, initial: 12 } as const;
const LAB_FRACTION_DIGITS = 2;
const glassVariantTokens = Object.keys(glassVariants) as GlassVariant[];

function formatOptic(value: number, unit: string): string {
  return unit === '' ? value.toFixed(LAB_FRACTION_DIGITS) : `${String(value)}${unit}`;
}

function GlassLabSection() {
  const { messages } = useI18n();
  const text = messages.gallery.glass;
  const glass = useGlass();
  const [variant, setVariant] = useState<GlassVariant>('clear');
  const [overrides, setOverrides] = useState<Partial<Record<LabOptic, number>>>({});
  const [spacing, setSpacing] = useState<number>(glassGroup.spacing);
  const [gap, setGap] = useState<number>(LAB_GAP.initial);
  const [interactive, setInteractive] = useState(true);
  const opticValue = (key: LabOptic): number => overrides[key] ?? glassVariants[variant][key];

  return (
    <GallerySection title={messages.gallery.sections.glass}>
      <p className={styles.subtitle}>{text.description}</p>
      <div className={styles.row}>
        <Badge tone="tint" data-testid="glass-tier">
          {text.tierLabel(messages.glass.tiers[glass.tier])}
        </Badge>
      </div>
      <SegmentedControl
        label={text.preferenceLabel}
        items={GLASS_TIER_PREFERENCES.map((id) => ({ id, label: messages.glass.preferences[id] }))}
        selectedKey={glass.preference}
        onSelectionChange={glass.setPreference}
      />
      <div className={styles.labStage} role="group" aria-label={text.stageLabel}>
        <GlassGroup
          variant={variant}
          spacing={spacing}
          optics={overrides}
          className={styles.labGroup}
          style={{ '--lab-gap': `${String(gap)}px` }}
          data-testid="glass-lab-group"
        >
          <LiquidGlass
            variant={variant}
            radius="xl"
            interactive={interactive}
            className={styles.labCard}
            data-testid="glass-lab-card"
          >
            <span className={styles.labWord} lang="de">
              der Schrank
            </span>
            <span className={styles.labCaption}>{text.cardCaption}</span>
          </LiquidGlass>
          <LiquidGlass
            variant={variant}
            radius="capsule"
            interactive={interactive}
            className={styles.labPill}
            data-testid="glass-lab-pill"
          >
            <Volume2 size={componentGeometry.iconLg} aria-hidden />
          </LiquidGlass>
        </GlassGroup>
      </div>
      <SegmentedControl
        label={text.variantLabel}
        items={glassVariantTokens.map((id) => ({ id, label: text.variants[id] }))}
        selectedKey={variant}
        onSelectionChange={(next) => {
          setVariant(next);
          setOverrides({});
        }}
      />
      <div className={styles.labControls}>
        {LAB_OPTIC_KEYS.map((key) => {
          const range = LAB_OPTICS[key];
          return (
            <Slider
              key={key}
              label={text[key]}
              minValue={range.min}
              maxValue={range.max}
              step={range.step}
              value={opticValue(key)}
              onChange={(value) => {
                setOverrides((previous) => ({ ...previous, [key]: value }));
              }}
              formatValue={(value) => formatOptic(value, range.unit)}
            />
          );
        })}
        <Slider
          label={text.spacing}
          minValue={LAB_SPACING.min}
          maxValue={LAB_SPACING.max}
          step={LAB_SPACING.step}
          value={spacing}
          onChange={setSpacing}
          formatValue={(value) => formatOptic(value, 'px')}
        />
        <Slider
          label={text.gap}
          minValue={LAB_GAP.min}
          maxValue={LAB_GAP.max}
          step={LAB_GAP.step}
          value={gap}
          onChange={setGap}
          formatValue={(value) => formatOptic(value, 'px')}
        />
        <Switch isSelected={interactive} onChange={setInteractive}>
          {text.pointer}
        </Switch>
      </div>
    </GallerySection>
  );
}

export function DesignGallery() {
  const { messages, locale, setLocale } = useI18n();
  return (
    <div className={styles.gallery}>
      <header>
        <NavigationBar title={messages.gallery.title} />
        <p className={styles.subtitle}>{messages.gallery.subtitle}</p>
      </header>

      <Card title={messages.locale.label} headingLevel={2}>
        <SegmentedControl
          label={messages.locale.label}
          items={SUPPORTED_LOCALES.map((id) => ({ id, label: LOCALE_NATIVE_NAMES[id] }))}
          selectedKey={locale}
          onSelectionChange={setLocale}
        />
      </Card>

      <ColorsSection />
      <TokensSections />
      <ButtonsSection />
      <InputsSection />
      <SelectionSection />
      <OverlaysSection />
      <NavigationSection />
      <ContentSection />
      <GlassLabSection />
      <MotionLabSection />
    </div>
  );
}
