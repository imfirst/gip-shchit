/* База оборудования кондиционирования ГИП (панель GIPCOND).
   Размеры: W — ширина (вдоль стены), H — высота, D — глубина (от стены); мм. Мощности — кВт (охлаждение / обогрев).
   liq / gas — диаметры фреонопроводов, мм (как пишутся на чертеже: «6,35»). drain — дренажный патрубок, мм.
   src: 'cat' — сверено с каталогом/карточкой производителя; 'approx' — ориентировочно, сверить с каталогом перед выпуском. */
var COND_DB = {
  brands: [
    { id: 'lg_vrf', name: 'LG Multi V (VRF)', maker: 'LG', mode: 'vrf', refnet: { code: 'ARBLN01621', name: 'Рефнет-разветвитель', unit: 'компл.' },
      // диаметры участков между рефнетами по суммарной мощности внутренних блоков ниже по потоку (кВт)
      vrft: [[5.6, '6,35', '12,7'], [16.0, '9,52', '15,88'], [22.4, '9,52', '19,05'], [33.0, '9,52', '22,2'], [999, '12,7', '28,58']],
      extras: [{ name: 'Пульт управления', type: 'PWLSSB21H', unit: 'шт.', per: 'indoor' },
               { name: 'Модуль принудительного закрытия ЭРВ', type: 'PRIPO', unit: 'шт.', per: 'indoor' }] },
    { id: 'hisense_vrf', name: 'Hisense Hi-Smart (VRF)', maker: 'Hisense', mode: 'vrf', refnet: { code: 'HFQ-052F', name: 'Разветвитель (рефнет)', unit: 'компл.', approx: true },
      vrft: [[5.6, '6,35', '12,7'], [16.8, '9,52', '15,88'], [22.4, '9,52', '19,05'], [33.0, '9,52', '22,2'], [999, '12,7', '28,58']],
      extras: [] },
    { id: 'haier_split', name: 'Haier сплит-системы', maker: 'Haier', mode: 'split', extras: [] },
    { id: 'haier_multi', name: 'Haier мульти-сплит', maker: 'Haier', mode: 'multi', extras: [] }
  ],
  indoor: [
    // ---- LG Multi V, настенные STANDARD (lg-b2b.ru: 837×308×189; жидкость 6,35, газ 12,7, дренаж 16)
    { brand: 'lg_vrf', type: 'wall', model: 'ARNU05GSJC4', q: 1.6, qh: 1.8, W: 837, H: 308, D: 189, liq: '6,35', gas: '12,7', drain: 16, kg: 8.4, src: 'cat' },
    { brand: 'lg_vrf', type: 'wall', model: 'ARNU07GSJC4', q: 2.2, qh: 2.5, W: 837, H: 308, D: 189, liq: '6,35', gas: '12,7', drain: 16, kg: 8.4, src: 'cat' },
    { brand: 'lg_vrf', type: 'wall', model: 'ARNU09GSJC4', q: 2.8, qh: 3.2, W: 837, H: 308, D: 189, liq: '6,35', gas: '12,7', drain: 16, kg: 8.4, src: 'cat' },
    { brand: 'lg_vrf', type: 'wall', model: 'ARNU12GSJC4', q: 3.6, qh: 4.0, W: 837, H: 308, D: 189, liq: '6,35', gas: '12,7', drain: 16, kg: 8.4, src: 'cat' },
    { brand: 'lg_vrf', type: 'wall', model: 'ARNU15GSJC4', q: 4.5, qh: 5.0, W: 837, H: 308, D: 189, liq: '6,35', gas: '12,7', drain: 16, kg: 8.4, src: 'cat' },
    { brand: 'lg_vrf', type: 'wall', model: 'ARNU18GSKC4', q: 5.6, qh: 6.3, W: 998, H: 345, D: 210, liq: '6,35', gas: '12,7', drain: 16, kg: 11, src: 'cat' },
    { brand: 'lg_vrf', type: 'wall', model: 'ARNU24GSKC4', q: 7.1, qh: 8.0, W: 998, H: 345, D: 210, liq: '9,52', gas: '15,88', drain: 16, kg: 11, src: 'approx' },
    // ---- LG Multi V, канальные низконапорные (ориентировочно)
    { brand: 'lg_vrf', type: 'duct', model: 'ARNU07GL1G4', q: 2.2, qh: 2.5, W: 900, H: 190, D: 700, liq: '6,35', gas: '12,7', drain: 25, src: 'approx' },
    { brand: 'lg_vrf', type: 'duct', model: 'ARNU09GL1G4', q: 2.8, qh: 3.2, W: 900, H: 190, D: 700, liq: '6,35', gas: '12,7', drain: 25, src: 'approx' },
    { brand: 'lg_vrf', type: 'duct', model: 'ARNU12GL1G4', q: 3.6, qh: 4.0, W: 900, H: 190, D: 700, liq: '6,35', gas: '12,7', drain: 25, src: 'approx' },
    { brand: 'lg_vrf', type: 'duct', model: 'ARNU15GL2G4', q: 4.5, qh: 5.0, W: 1100, H: 190, D: 700, liq: '6,35', gas: '12,7', drain: 25, src: 'approx' },
    { brand: 'lg_vrf', type: 'duct', model: 'ARNU18GL2G4', q: 5.6, qh: 6.3, W: 1100, H: 190, D: 700, liq: '6,35', gas: '12,7', drain: 25, src: 'approx' },
    // ---- Hisense VRF, настенные AVS-HJFTDD (845×270×203; 6,35 / 9,52; дренаж 16)
    { brand: 'hisense_vrf', type: 'wall', model: 'AVS-07HJFTDD', q: 2.2, qh: 2.5, W: 845, H: 270, D: 203, liq: '6,35', gas: '9,52', drain: 16, kg: 9, src: 'cat' },
    { brand: 'hisense_vrf', type: 'wall', model: 'AVS-09HJFTDD', q: 2.8, qh: 3.3, W: 845, H: 270, D: 203, liq: '6,35', gas: '9,52', drain: 16, kg: 9, src: 'cat' },
    { brand: 'hisense_vrf', type: 'wall', model: 'AVS-12HJFTDD', q: 3.6, qh: 4.0, W: 845, H: 270, D: 203, liq: '6,35', gas: '9,52', drain: 16, kg: 9, src: 'cat' },
    { brand: 'hisense_vrf', type: 'wall', model: 'AVS-15HJFTDD', q: 4.5, qh: 5.0, W: 1000, H: 315, D: 230, liq: '6,35', gas: '12,7', drain: 16, src: 'approx' },
    { brand: 'hisense_vrf', type: 'wall', model: 'AVS-18HJFTDD', q: 5.6, qh: 6.3, W: 1000, H: 315, D: 230, liq: '6,35', gas: '12,7', drain: 16, src: 'approx' },
    // ---- Hisense VRF, тонкие канальные AVE-HCFRL (700×192×447; дренаж 25)
    { brand: 'hisense_vrf', type: 'duct', model: 'AVE-07HCFRL', q: 2.2, qh: 2.5, W: 700, H: 192, D: 447, liq: '6,35', gas: '12,7', drain: 25, src: 'approx' },
    { brand: 'hisense_vrf', type: 'duct', model: 'AVE-09HCFRL', q: 2.8, qh: 3.2, W: 700, H: 192, D: 447, liq: '6,35', gas: '12,7', drain: 25, src: 'approx' },
    { brand: 'hisense_vrf', type: 'duct', model: 'AVE-12HCFRL', q: 3.6, qh: 4.0, W: 700, H: 192, D: 447, liq: '6,35', gas: '12,7', drain: 25, src: 'approx' },
    // ---- Haier Quantum (сплит): внутренний 700×265×190 (AS20/25), трасса до 15 м
    { brand: 'haier_split', type: 'wall', model: 'AS20HQJ2HRA-W', out: '1U20HQJ2FRA', q: 2.05, qh: 2.1, W: 700, H: 265, D: 190, liq: '6,35', gas: '9,52', drain: 16, src: 'cat' },
    { brand: 'haier_split', type: 'wall', model: 'AS25HQJ2HRA-W', out: '1U25HQJ2FRA', q: 2.6, qh: 2.8, W: 700, H: 265, D: 190, liq: '6,35', gas: '9,52', drain: 16, src: 'approx' },
    { brand: 'haier_split', type: 'wall', model: 'AS35HQJ2HRA-W', out: '1U35HQJ2FRA', q: 3.5, qh: 3.6, W: 802, H: 280, D: 205, liq: '6,35', gas: '9,52', drain: 16, src: 'approx' },
    { brand: 'haier_split', type: 'wall', model: 'AS50HQJ2HRA-W', out: '1U50HQJ2FRA', q: 5.0, qh: 5.2, W: 975, H: 300, D: 225, liq: '6,35', gas: '12,7', drain: 16, src: 'approx' },
    // ---- Haier мульти-сплит, настенные Flexis (856×300×197 AS25–AS50)
    { brand: 'haier_multi', type: 'wall', model: 'AS25S2SF1FA-W', q: 2.5, qh: 2.8, W: 856, H: 300, D: 197, liq: '6,35', gas: '9,52', drain: 16, src: 'approx' },
    { brand: 'haier_multi', type: 'wall', model: 'AS35S2SF1FA-W', q: 3.5, qh: 3.8, W: 856, H: 300, D: 197, liq: '6,35', gas: '9,52', drain: 16, src: 'approx' },
    { brand: 'haier_multi', type: 'wall', model: 'AS50S2SF1FA-W', q: 5.0, qh: 5.5, W: 999, H: 323, D: 225, liq: '6,35', gas: '12,7', drain: 16, src: 'approx' }
  ],
  outdoor: [
    // ---- LG Multi V S (однофазные)
    { brand: 'lg_vrf', model: 'ARUN040GSS0', q: 12.1, qh: 12.5, W: 950, H: 834, D: 330, liq: '9,52', gas: '15,88', maxIdx: 1.3, src: 'approx' },
    { brand: 'lg_vrf', model: 'ARUN050GSS0', q: 14.0, qh: 16.0, W: 950, H: 1380, D: 330, liq: '9,52', gas: '19,05', maxIdx: 1.3, src: 'approx' },
    { brand: 'lg_vrf', model: 'ARUN060GSS0', q: 15.5, qh: 18.0, W: 950, H: 1380, D: 330, liq: '9,52', gas: '19,05', maxIdx: 1.3, src: 'approx' },
    // ---- Hisense mini VRF
    { brand: 'hisense_vrf', model: 'AVW-38UCSC', q: 11.2, qh: 12.5, W: 950, H: 1380, D: 370, liq: '9,52', gas: '15,88', maxIdx: 1.3, src: 'approx' },
    { brand: 'hisense_vrf', model: 'AVW-48UCSC', q: 14.0, qh: 16.0, W: 950, H: 1380, D: 370, liq: '9,52', gas: '19,05', maxIdx: 1.3, src: 'approx' },
    { brand: 'hisense_vrf', model: 'AVW-54UCSC', q: 15.5, qh: 18.0, W: 950, H: 1380, D: 370, liq: '9,52', gas: '19,05', maxIdx: 1.3, src: 'approx' },
    // ---- Haier Quantum (сплит): 757×432×281
    { brand: 'haier_split', model: '1U20HQJ2FRA', q: 2.05, W: 757, H: 432, D: 281, src: 'cat' },
    { brand: 'haier_split', model: '1U25HQJ2FRA', q: 2.6, W: 757, H: 432, D: 281, src: 'approx' },
    { brand: 'haier_split', model: '1U35HQJ2FRA', q: 3.5, W: 800, H: 553, D: 275, src: 'approx' },
    { brand: 'haier_split', model: '1U50HQJ2FRA', q: 5.0, W: 800, H: 553, D: 275, src: 'approx' },
    // ---- Haier мульти-сплит (порты — число внутренних блоков)
    { brand: 'haier_multi', model: '2U40S2SM1FA', q: 4.0, qh: 4.5, W: 800, H: 553, D: 275, ports: 2, maxIdx: 1.5, src: 'approx' },
    { brand: 'haier_multi', model: '3U55S2SR3FA', q: 5.5, qh: 6.8, W: 890, H: 697, D: 353, ports: 3, maxIdx: 1.5, src: 'approx' },
    { brand: 'haier_multi', model: '4U75S2SR5FA', q: 7.5, qh: 8.5, W: 946, H: 810, D: 410, ports: 4, maxIdx: 1.5, src: 'approx' },
    { brand: 'haier_multi', model: '5U105S2SS5FA', q: 10.5, qh: 12.0, W: 946, H: 810, D: 410, ports: 5, maxIdx: 1.5, src: 'approx' }
  ],
  // медные трубы и изоляция (как в спецификациях ГИП: «Трубы медные %%C6,35 мм», «K-Flex ST 9x6»)
  copper: {
    '6,35': { inch: '1/4"', ins: 'K-Flex ST 9x6' }, '9,52': { inch: '3/8"', ins: 'K-Flex ST 9x9' }, '12,7': { inch: '1/2"', ins: 'K-Flex ST 9x12' },
    '15,88': { inch: '5/8"', ins: 'K-Flex ST 9x15' }, '19,05': { inch: '3/4"', ins: 'K-Flex ST 9x18' }, '22,2': { inch: '7/8"', ins: 'K-Flex ST 9x22' },
    '28,58': { inch: '1 1/8"', ins: 'K-Flex ST 9x28' }
  },
  drain: [
    { key: 'DR', name: 'Труба ПП %%C20 мм, PN 20', type: 'VTp.700.0020.20', maker: 'VALTEC', unit: 'п.м.', k: 1.1 },
    { key: 'DRE', name: 'Уголок ПП %%C20 мм', type: 'VTp.751.0.020', maker: 'VALTEC', unit: 'шт.', k: 1 },
    { key: 'DRT', name: 'Тройник ПП %%C20 мм', type: 'VTp.731.0.020', maker: 'VALTEC', unit: 'шт.', k: 1 },
    { key: 'HL', name: 'Капельная воронка для кондиционеров с разрывом струи', type: 'HL138', maker: 'HL', unit: 'шт.', k: 1 }
  ],
  pump: [{ name: 'Дренажная помпа', type: 'Si-27', maker: 'Sauermann', unit: 'шт.' }, { name: 'Шланг дренажный %%C6 мм', type: '', maker: 'Sauermann', unit: 'п.м.', perUnit: 4 }]
};
if (typeof module !== 'undefined') module.exports = COND_DB;
