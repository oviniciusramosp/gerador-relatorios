#!/usr/bin/env node
/**
 * Gera icon-cross-map.js: Material Symbols ↔ Tabler Icons.
 *
 * Fontes:
 *  1) CURATED — aliases semânticos (favorite→heart, delete→trash…)
 *  2) exact — mesmo nome snake_case ↔ kebab-case
 *  3) stripped — remove _outline/_border/_filled e tenta de novo
 *
 * Uso: node tools/gen-icon-cross-map.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MATERIAL_SYMBOLS } from '../material-symbols-names.js';
import { TABLER_ICONS } from '../tabler-icons-names.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'icon-cross-map.js');

const tb = new Set(TABLER_ICONS);
const ms = new Set(MATERIAL_SYMBOLS);

/**
 * Material (snake) → Tabler (kebab). Só entradas curadas; o gerador
 * descarta targets que não existem no set Tabler.
 */
const CURATED = {
  // UI core
  favorite: 'heart',
  favorite_border: 'heart',
  heart_broken: 'heart-broken',
  delete: 'trash',
  delete_outline: 'trash',
  delete_forever: 'trash-x',
  delete_sweep: 'trash',
  auto_delete: 'trash',
  restore_from_trash: 'trash',
  close: 'x',
  clear: 'x',
  cancel: 'x',
  highlight_off: 'circle-x',
  check: 'check',
  check_circle: 'circle-check',
  task_alt: 'circle-check',
  done: 'check',
  done_all: 'checks',
  add: 'plus',
  add_circle: 'circle-plus',
  add_circle_outline: 'circle-plus',
  remove: 'minus',
  remove_circle: 'circle-minus',
  remove_circle_outline: 'circle-minus',
  edit: 'pencil',
  mode_edit: 'pencil',
  mode_edit_outline: 'pencil',
  create: 'pencil',
  border_color: 'pencil',
  search: 'search',
  search_off: 'search-off',
  settings: 'settings',
  tune: 'adjustments',
  manage_search: 'list-search',
  info: 'info-circle',
  info_outline: 'info-circle',
  help: 'help',
  help_outline: 'help',
  question_mark: 'question-mark',
  warning: 'alert-triangle',
  warning_amber: 'alert-triangle',
  error: 'alert-circle',
  error_outline: 'alert-circle',
  report: 'alert-circle',
  report_problem: 'alert-triangle',
  report_gmailerrorred: 'alert-circle',
  announcement: 'speakerphone',
  campaign: 'speakerphone',
  // people / identity
  mail: 'mail',
  email: 'mail',
  alternate_email: 'at',
  markunread: 'mail',
  mark_email_read: 'mail-opened',
  mark_email_unread: 'mail',
  person: 'user',
  person_outline: 'user',
  person_off: 'user-off',
  people: 'users',
  people_outline: 'users',
  group: 'users',
  groups: 'users-group',
  group_add: 'user-plus',
  person_add: 'user-plus',
  person_remove: 'user-minus',
  account_circle: 'user-circle',
  account_box: 'user',
  manage_accounts: 'users',
  supervisor_account: 'user-star',
  badge: 'id',
  contacts: 'address-book',
  contact_mail: 'mail',
  contact_phone: 'phone',
  // navigation
  menu: 'menu-2',
  more_vert: 'dots-vertical',
  more_horiz: 'dots',
  arrow_back: 'arrow-left',
  arrow_forward: 'arrow-right',
  arrow_upward: 'arrow-up',
  arrow_downward: 'arrow-down',
  arrow_back_ios: 'chevron-left',
  arrow_forward_ios: 'chevron-right',
  chevron_left: 'chevron-left',
  chevron_right: 'chevron-right',
  expand_more: 'chevron-down',
  expand_less: 'chevron-up',
  keyboard_arrow_down: 'chevron-down',
  keyboard_arrow_up: 'chevron-up',
  keyboard_arrow_left: 'chevron-left',
  keyboard_arrow_right: 'chevron-right',
  north: 'arrow-up',
  south: 'arrow-down',
  east: 'arrow-right',
  west: 'arrow-left',
  subdirectory_arrow_right: 'corner-down-right',
  subdirectory_arrow_left: 'corner-down-left',
  // transfer
  download: 'download',
  upload: 'upload',
  file_download: 'download',
  file_upload: 'upload',
  cloud_download: 'cloud-download',
  cloud_upload: 'cloud-upload',
  save_alt: 'download',
  share: 'share-2',
  ios_share: 'share',
  // visibility / security
  visibility: 'eye',
  visibility_off: 'eye-off',
  lock: 'lock',
  lock_open: 'lock-open',
  lock_outline: 'lock',
  lock_reset: 'lock',
  vpn_key: 'key',
  key: 'key',
  password: 'password',
  fingerprint: 'fingerprint',
  security: 'shield',
  verified: 'circle-check',
  verified_user: 'shield-check',
  gpp_good: 'shield-check',
  admin_panel_settings: 'shield-lock',
  privacy_tip: 'shield',
  vpn_lock: 'shield-lock',
  // time / place
  calendar_today: 'calendar',
  calendar_month: 'calendar',
  event: 'calendar-event',
  event_available: 'calendar-check',
  event_busy: 'calendar-x',
  schedule: 'clock',
  access_time: 'clock',
  watch_later: 'clock',
  history: 'history',
  update: 'reload',
  place: 'map-pin',
  location_on: 'map-pin',
  location_off: 'map-pin-off',
  my_location: 'current-location',
  near_me: 'current-location',
  pin_drop: 'map-pin',
  room: 'map-pin',
  where_to_vote: 'map-pin',
  map: 'map',
  explore: 'compass',
  travel_explore: 'world-search',
  navigation: 'navigation',
  compass_calibration: 'compass',
  // devices / comms
  phone: 'phone',
  call: 'phone',
  call_end: 'phone-off',
  smartphone: 'device-mobile',
  phone_iphone: 'device-mobile',
  phone_android: 'device-mobile',
  computer: 'device-desktop',
  desktop_windows: 'device-desktop',
  desktop_mac: 'device-desktop',
  laptop: 'device-laptop',
  laptop_mac: 'device-laptop',
  tablet: 'device-tablet',
  tablet_mac: 'device-tablet',
  watch: 'device-watch',
  tv: 'device-tv',
  headphones: 'headphones',
  headset: 'headset',
  headset_mic: 'headset',
  mic: 'microphone',
  mic_none: 'microphone',
  mic_off: 'microphone-off',
  keyboard: 'keyboard',
  mouse: 'mouse',
  // world / language
  language: 'language',
  public: 'world',
  public_off: 'world-off',
  translate: 'language',
  web: 'world-www',
  http: 'world-www',
  https: 'world-www',
  // media
  star: 'star',
  star_border: 'star',
  star_outline: 'star',
  star_half: 'star-half',
  grade: 'star',
  stars: 'stars',
  bookmark: 'bookmark',
  bookmark_border: 'bookmark',
  flag: 'flag',
  outlined_flag: 'flag',
  image: 'photo',
  photo: 'photo',
  photo_library: 'photo',
  collections: 'photo',
  photo_camera: 'camera',
  camera_alt: 'camera',
  camera: 'camera',
  camera_roll: 'photo',
  panorama: 'photo',
  videocam: 'video',
  videocam_off: 'video-off',
  video_call: 'video',
  video_library: 'video',
  movie: 'movie',
  play_arrow: 'player-play',
  pause: 'player-pause',
  stop: 'player-stop',
  skip_next: 'player-skip-forward',
  skip_previous: 'player-skip-back',
  fast_forward: 'player-track-next',
  fast_rewind: 'player-track-prev',
  replay: 'reload',
  volume_up: 'volume',
  volume_down: 'volume-2',
  volume_mute: 'volume-3',
  volume_off: 'volume-off',
  music_note: 'music',
  library_music: 'music',
  queue_music: 'playlist',
  equalizer: 'adjustments',
  album: 'disc',
  // edit clipboard
  content_copy: 'copy',
  content_cut: 'cut',
  content_paste: 'clipboard',
  undo: 'arrow-back-up',
  redo: 'arrow-forward-up',
  refresh: 'refresh',
  sync: 'refresh',
  cached: 'refresh',
  autorenew: 'refresh',
  open_in_new: 'external-link',
  launch: 'external-link',
  open_in_browser: 'external-link',
  link: 'link',
  link_off: 'link-off',
  attach_file: 'paperclip',
  attachment: 'paperclip',
  print: 'printer',
  save: 'device-floppy',
  // files
  folder: 'folder',
  folder_open: 'folder-open',
  folder_shared: 'folder-share',
  create_new_folder: 'folder-plus',
  description: 'file-text',
  article: 'file-text',
  insert_drive_file: 'file',
  note: 'note',
  notes: 'notes',
  sticky_note_2: 'note',
  picture_as_pdf: 'file-type-pdf',
  draft: 'file',
  drafts: 'mail',
  // code / tools
  code: 'code',
  terminal: 'terminal',
  bug_report: 'bug',
  lightbulb: 'bulb',
  lightbulb_outline: 'bulb',
  build: 'tool',
  construction: 'crane',
  handyman: 'tool',
  hardware: 'tool',
  engineering: 'settings',
  design_services: 'ruler',
  architecture: 'building',
  // commerce
  shopping_cart: 'shopping-cart',
  add_shopping_cart: 'shopping-cart-plus',
  remove_shopping_cart: 'shopping-cart-x',
  shopping_bag: 'shopping-bag',
  shopping_basket: 'basket',
  store: 'building-store',
  storefront: 'building-store',
  local_mall: 'building-store',
  payment: 'credit-card',
  credit_card: 'credit-card',
  account_balance: 'building-bank',
  account_balance_wallet: 'wallet',
  attach_money: 'currency-dollar',
  payments: 'cash',
  monetization_on: 'coin',
  savings: 'pig',
  receipt: 'receipt',
  receipt_long: 'receipt',
  local_offer: 'tag',
  sell: 'tag',
  tag: 'tag',
  label: 'tag',
  request_quote: 'file-invoice',
  currency_bitcoin: 'currency-bitcoin',
  currency_exchange: 'exchange',
  // notifications / chat
  notifications: 'bell',
  notifications_none: 'bell',
  notifications_off: 'bell-off',
  notifications_active: 'bell-ringing',
  chat: 'message',
  chat_bubble: 'message',
  chat_bubble_outline: 'message',
  comment: 'message',
  comments: 'messages',
  forum: 'messages',
  send: 'send',
  inbox: 'inbox',
  // social feedback
  thumb_up: 'thumb-up',
  thumb_down: 'thumb-down',
  thumbs_up_down: 'thumb-up',
  trending_up: 'trending-up',
  trending_down: 'trending-down',
  // charts / layout
  bar_chart: 'chart-bar',
  show_chart: 'chart-line',
  pie_chart: 'chart-pie',
  analytics: 'chart-dots',
  query_stats: 'chart-dots',
  dashboard: 'layout-dashboard',
  apps: 'apps',
  grid_view: 'layout-grid',
  view_module: 'layout-grid',
  view_list: 'list',
  view_agenda: 'layout-list',
  view_column: 'columns',
  list: 'list',
  checklist: 'list-check',
  format_list_bulleted: 'list',
  format_list_numbered: 'list-numbers',
  filter_list: 'filter',
  filter_alt: 'filter',
  filter: 'filter',
  filter_vintage: 'filter',
  sort: 'arrows-sort',
  table_chart: 'table',
  table_rows: 'table',
  widgets: 'layout-grid',
  // home / places
  home: 'home',
  house: 'home',
  apartment: 'building',
  business: 'building',
  work: 'briefcase',
  work_outline: 'briefcase',
  school: 'school',
  // science / health
  science: 'flask',
  biotech: 'dna',
  psychology: 'brain',
  fitness_center: 'barbell',
  monitor_heart: 'heartbeat',
  health_and_safety: 'heartbeat',
  medication: 'pill',
  local_hospital: 'hospital',
  local_pharmacy: 'pill',
  medical_services: 'ambulance',
  emergency: 'urgent',
  sick: 'thermometer',
  vaccines: 'vaccine',
  bloodtype: 'droplet',
  monitor_weight: 'scale',
  // transport
  directions_car: 'car',
  directions_bus: 'bus',
  directions_bike: 'bike',
  directions_walk: 'walk',
  directions_run: 'run',
  flight: 'plane',
  flight_takeoff: 'plane-departure',
  flight_land: 'plane-arrival',
  local_shipping: 'truck',
  train: 'train',
  directions_subway: 'train',
  directions_railway: 'train',
  directions_boat: 'ship',
  // food / lodging
  local_cafe: 'coffee',
  local_bar: 'glass',
  restaurant: 'tools-kitchen-2',
  local_pizza: 'pizza',
  hotel: 'bed',
  // weather / nature
  water_drop: 'droplet',
  water: 'droplet',
  air: 'wind',
  wb_sunny: 'sun',
  light_mode: 'sun',
  dark_mode: 'moon',
  nightlight: 'moon',
  nightlight_round: 'moon',
  cloud: 'cloud',
  cloud_queue: 'cloud',
  cloud_off: 'cloud-off',
  cloud_done: 'cloud-check',
  cloud_sync: 'cloud',
  umbrella: 'umbrella',
  bolt: 'bolt',
  flash_on: 'bolt',
  flash_off: 'bolt-off',
  ac_unit: 'snowflake',
  severe_cold: 'temperature-snow',
  whatshot: 'flame',
  local_fire_department: 'flame',
  eco: 'leaf',
  park: 'tree',
  forest: 'trees',
  pets: 'paw',
  pet: 'paw',
  cruelty_free: 'leaf',
  nest_eco_leaf: 'leaf',
  compost: 'recycle',
  recycling: 'recycle',
  yard: 'plant',
  grass: 'plant-2',
  landscape: 'mountain',
  terrain: 'mountain',
  filter_hdr: 'mountain',
  volcano: 'mountain',
  waves: 'wave-sine',
  tsunami: 'wave-sine',
  thunderstorm: 'cloud-storm',
  filter_drama: 'cloud',
  // power / network
  power: 'power',
  power_settings_new: 'power',
  wifi: 'wifi',
  wifi_off: 'wifi-off',
  bluetooth: 'bluetooth',
  bluetooth_connected: 'bluetooth-connected',
  bluetooth_disabled: 'bluetooth-off',
  battery_full: 'battery',
  battery_charging_full: 'battery-charging',
  battery_alert: 'battery',
  signal_cellular_alt: 'antenna-bars-5',
  storage: 'database',
  hard_drive: 'server',
  memory: 'cpu',
  developer_board: 'cpu',
  dns: 'server',
  router: 'router',
  lan: 'network',
  usb: 'usb',
  cable: 'plug',
  power_input: 'plug',
  sd_card: 'device-sd-card',
  light: 'bulb',
  // design / format
  palette: 'palette',
  color_lens: 'palette',
  style: 'palette',
  brush: 'brush',
  format_bold: 'bold',
  format_italic: 'italic',
  format_underlined: 'underline',
  format_align_left: 'align-left',
  format_align_center: 'align-center',
  format_align_right: 'align-right',
  format_align_justify: 'align-justified',
  format_quote: 'quote',
  format_size: 'text-size',
  title: 'h-1',
  text_fields: 'forms',
  push_pin: 'pin',
  invert_colors: 'color-swatch',
  opacity: 'droplet-half',
  texture: 'texture',
  blur_on: 'blur',
  // misc common
  login: 'login',
  logout: 'logout',
  exit_to_app: 'logout',
  support_agent: 'headset',
  contact_support: 'help',
  feedback: 'message-report',
  rate_review: 'message',
  emoji_emotions: 'mood-smile',
  emoji_events: 'trophy',
  celebration: 'confetti',
  cake: 'cake',
  card_giftcard: 'gift',
  redeem: 'gift',
  gift: 'gift',
  rocket: 'rocket',
  rocket_launch: 'rocket',
  auto_awesome: 'sparkles',
  magic_button: 'wand',
  extension: 'puzzle',
  timeline: 'timeline',
  qr_code: 'qrcode',
  qr_code_2: 'qrcode',
  qr_code_scanner: 'qrcode',
  fullscreen: 'arrows-maximize',
  fullscreen_exit: 'arrows-minimize',
  zoom_in: 'zoom-in',
  zoom_out: 'zoom-out',
  crop: 'crop',
  rotate_right: 'rotate-clockwise',
  rotate_left: 'rotate',
  open_with: 'arrows-move',
  open_in_full: 'arrows-maximize',
  close_fullscreen: 'arrows-minimize',
  compare_arrows: 'arrows-exchange',
  swap_horiz: 'arrows-exchange',
  swap_vert: 'arrows-exchange-2',
  drag_indicator: 'grip-vertical',
  drag_handle: 'grip-horizontal',
  inventory: 'package',
  inventory_2: 'box',
  category: 'category',
  layers: 'stack-2',
  burst_mode: 'stack',
  calculate: 'calculator',
  percent: 'percentage',
  functions: 'math-function',
  numbers: 'numbers',
  pin: 'pin',
  gavel: 'gavel',
  balance: 'scale',
  copyright: 'copyright',
  trademark: 'trademark',
  registered: 'registered',
  policy: 'gavel',
  new_releases: 'rosette',
  fiber_new: 'new-section',
  fiber_manual_record: 'circle-dot',
  radio_button_checked: 'circle-dot',
  radio_button_unchecked: 'circle',
  check_box: 'checkbox',
  check_box_outline_blank: 'square',
  indeterminate_check_box: 'square-minus',
  toggle_on: 'toggle-right',
  toggle_off: 'toggle-left',
  switch_left: 'switch-horizontal',
  switch_right: 'switch-horizontal',
  book: 'book',
  menu_book: 'book',
  auto_stories: 'book',
  library_books: 'books',
  import_contacts: 'book',
  local_library: 'book',
  newspaper: 'news',
  rss_feed: 'rss',
  podcasts: 'microphone',
  live_tv: 'broadcast',
  radio: 'radio',
  accessibility: 'accessible',
  accessible: 'accessible',
  child_care: 'baby-carriage',
  stroller: 'baby-carriage',
  male: 'gender-male',
  female: 'gender-female',
  pregnant_woman: 'gender-female',
  trans_gender: 'gender-transgender',
  diversity_3: 'users-group',
  family_restroom: 'users',
  elderly: 'old',
  wheelchair_pickup: 'wheelchair',
  sentiment_satisfied: 'mood-smile',
  sentiment_dissatisfied: 'mood-sad',
  sentiment_neutral: 'mood-empty',
  sentiment_very_satisfied: 'mood-happy',
  sentiment_very_dissatisfied: 'mood-sad',
  mood: 'mood-smile',
  sports_soccer: 'ball-football',
  sports_basketball: 'ball-basketball',
  sports_tennis: 'ball-tennis',
  self_improvement: 'yoga',
  beach_access: 'beach',
  pool: 'pool',
  camping: 'tent',
  sailing: 'sailboat',
  kayaking: 'kayak',
  hiking: 'walk',
  surfing: 'wave-saw-tool',
  fireworks: 'flare',
  satellite: 'satellite',
  account_tree: 'hierarchy',
  schema: 'hierarchy',
  hub: 'topology-star',
  device_hub: 'topology-star',
  backup: 'cloud-upload',
  restore: 'history',
  tab: 'browser',
  touch_app: 'hand-click',
  pan_tool: 'hand-stop',
  front_hand: 'hand-stop',
  back_hand: 'hand-stop',
  gesture: 'hand-move',
  diamond: 'diamond',
  local_laundry_service: 'wash',
  dry_cleaning: 'hanger',
  iron: 'ironing',
  checkroom: 'hanger',
  cleaning_services: 'sparkles',
  electrical_services: 'bolt',
  plumbing: 'test-pipe',
  carpenter: 'wood',
  flashlight_on: 'bulb',
  flashlight_off: 'bulb-off',
  height: 'line-height',
  horizontal_rule: 'minus',
  space_bar: 'space',
  vertical_align_top: 'layout-align-top',
  vertical_align_center: 'layout-align-middle',
  vertical_align_bottom: 'layout-align-bottom',
  card_membership: 'id',
  spa: 'plant',
  graphic_eq: 'wave-sine',
  chrome_reader_mode: 'book',
  width_normal: 'separator-horizontal',
};

function stripMs(n) {
  return n
    .replace(/_outline$/, '')
    .replace(/_outlined$/, '')
    .replace(/_border$/, '')
    .replace(/_filled$/, '')
    .replace(/_sharp$/, '')
    .replace(/_rounded$/, '');
}

function scoreMs(name) {
  let s = 0;
  if (/outline|border/.test(name)) s += 10;
  if (/filled/.test(name)) s += 5;
  s += name.length / 100;
  return s;
}

const msToTb = {};
const tbToMs = {};
let curatedOk = 0;
const curatedMiss = [];

for (const [m, t] of Object.entries(CURATED)) {
  if (!tb.has(t)) {
    curatedMiss.push(`${m}→${t}`);
    continue;
  }
  msToTb[m] = t;
  curatedOk++;
}

let exact = 0;
for (const m of MATERIAL_SYMBOLS) {
  const k = m.replace(/_/g, '-');
  if (!tb.has(k)) continue;
  if (!msToTb[m]) {
    msToTb[m] = k;
    exact++;
  }
}

let stripped = 0;
for (const m of MATERIAL_SYMBOLS) {
  if (msToTb[m]) continue;
  const base = stripMs(m);
  if (base === m) continue;
  const k = base.replace(/_/g, '-');
  if (tb.has(k)) {
    msToTb[m] = k;
    stripped++;
  } else if (msToTb[base]) {
    msToTb[m] = msToTb[base];
    stripped++;
  }
}

for (const [m, t] of Object.entries(msToTb)) {
  if (!tbToMs[t] || scoreMs(m) < scoreMs(tbToMs[t])) tbToMs[t] = m;
}

let revExact = 0;
for (const t of TABLER_ICONS) {
  if (tbToMs[t]) continue;
  const m = t.replace(/-/g, '_');
  if (ms.has(m)) {
    tbToMs[t] = m;
    if (!msToTb[m]) msToTb[m] = t;
    revExact++;
  }
}

const lines = [];
lines.push('/* Material Symbols ↔ Tabler Icons — mapa de equivalência.');
lines.push(' * Gerado por tools/gen-icon-cross-map.mjs (curated + auto exact).');
lines.push(' * Não edite à mão — rode: node tools/gen-icon-cross-map.mjs');
lines.push(' */');
lines.push('');
lines.push('/** material snake → tabler kebab */');
lines.push('export const MS_TO_TABLER = {');
for (const k of Object.keys(msToTb).sort()) {
  lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(msToTb[k])},`);
}
lines.push('};');
lines.push('');
lines.push('/** tabler kebab → material snake (melhor match reverso) */');
lines.push('export const TABLER_TO_MS = {');
for (const k of Object.keys(tbToMs).sort()) {
  lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(tbToMs[k])},`);
}
lines.push('};');
lines.push('');

writeFileSync(OUT, lines.join('\n'));
console.log('ok:', OUT);
console.log({
  curatedOk,
  curatedMiss: curatedMiss.length,
  curatedMiss,
  exact,
  stripped,
  revExact,
  msToTb: Object.keys(msToTb).length,
  tbToMs: Object.keys(tbToMs).length,
});
