/** Real national flags offered as presets (UN member states only, as a neutral
 * criterion). `iso3` lists the Natural Earth country prefixes of map regions
 * whose computer factions default to this flag. Cosmetic only. */
export const FLAG_REGIONS = ['europe', 'asia', 'africa', 'americas', 'oceania'] as const;
export type FlagRegion = typeof FLAG_REGIONS[number];
export const FLAG_REGION_NAMES: Record<FlagRegion, [string, string]> = {
 europe: ['欧洲', 'Europe'], asia: ['亚洲', 'Asia'], africa: ['非洲', 'Africa'], americas: ['美洲', 'Americas'], oceania: ['大洋洲', 'Oceania'],
};

type Entry = readonly [id: string, iso3: string, zh: string, en: string, region: FlagRegion];
const ENTRIES = [
 // The original eight stay first so existing saves and preferences keep their meaning.
 ['cn', 'CHN', '中国', 'China', 'asia'], ['fr', 'FRA', '法国', 'France', 'europe'], ['de', 'DEU', '德国', 'Germany', 'europe'],
 ['it', 'ITA', '意大利', 'Italy', 'europe'], ['jp', 'JPN', '日本', 'Japan', 'asia'], ['gb', 'GBR', '英国', 'United Kingdom', 'europe'],
 ['us', 'USA', '美国', 'United States', 'americas'], ['ch', 'CHE', '瑞士', 'Switzerland', 'europe'],
 // Europe
 ['es', 'ESP', '西班牙', 'Spain', 'europe'], ['pt', 'PRT', '葡萄牙', 'Portugal', 'europe'], ['nl', 'NLD', '荷兰', 'Netherlands', 'europe'],
 ['be', 'BEL', '比利时', 'Belgium', 'europe'], ['lu', 'LUX', '卢森堡', 'Luxembourg', 'europe'], ['at', 'AUT', '奥地利', 'Austria', 'europe'],
 ['ie', 'IRL', '爱尔兰', 'Ireland', 'europe'], ['pl', 'POL', '波兰', 'Poland', 'europe'], ['cz', 'CZE', '捷克', 'Czechia', 'europe'],
 ['sk', 'SVK', '斯洛伐克', 'Slovakia', 'europe'], ['hu', 'HUN', '匈牙利', 'Hungary', 'europe'], ['ro', 'ROU', '罗马尼亚', 'Romania', 'europe'],
 ['bg', 'BGR', '保加利亚', 'Bulgaria', 'europe'], ['gr', 'GRC', '希腊', 'Greece', 'europe'], ['hr', 'HRV', '克罗地亚', 'Croatia', 'europe'],
 ['rs', 'SRB', '塞尔维亚', 'Serbia', 'europe'], ['ba', 'BIH', '波黑', 'Bosnia and Herzegovina', 'europe'], ['me', 'MNE', '黑山', 'Montenegro', 'europe'],
 ['al', 'ALB', '阿尔巴尼亚', 'Albania', 'europe'], ['mk', 'MKD', '北马其顿', 'North Macedonia', 'europe'], ['md', 'MDA', '摩尔多瓦', 'Moldova', 'europe'],
 ['ua', 'UKR', '乌克兰', 'Ukraine', 'europe'], ['by', 'BLR', '白俄罗斯', 'Belarus', 'europe'], ['lt', 'LTU', '立陶宛', 'Lithuania', 'europe'],
 ['lv', 'LVA', '拉脱维亚', 'Latvia', 'europe'], ['ee', 'EST', '爱沙尼亚', 'Estonia', 'europe'], ['fi', 'FIN', '芬兰', 'Finland', 'europe'],
 ['se', 'SWE', '瑞典', 'Sweden', 'europe'], ['no', 'NOR', '挪威', 'Norway', 'europe'], ['dk', 'DNK', '丹麦', 'Denmark', 'europe'],
 ['is', 'ISL', '冰岛', 'Iceland', 'europe'], ['ru', 'RUS', '俄罗斯', 'Russia', 'europe'],
 // Asia
 ['kr', 'KOR', '韩国', 'South Korea', 'asia'], ['kp', 'PRK', '朝鲜', 'North Korea', 'asia'], ['mn', 'MNG', '蒙古', 'Mongolia', 'asia'],
 ['in', 'IND', '印度', 'India', 'asia'], ['pk', 'PAK', '巴基斯坦', 'Pakistan', 'asia'], ['bd', 'BGD', '孟加拉国', 'Bangladesh', 'asia'],
 ['bt', 'BTN', '不丹', 'Bhutan', 'asia'], ['ir', 'IRN', '伊朗', 'Iran', 'asia'], ['iq', 'IRQ', '伊拉克', 'Iraq', 'asia'],
 ['sa', 'SAU', '沙特阿拉伯', 'Saudi Arabia', 'asia'], ['jo', 'JOR', '约旦', 'Jordan', 'asia'], ['sy', 'SYR', '叙利亚', 'Syria', 'asia'],
 ['lb', 'LBN', '黎巴嫩', 'Lebanon', 'asia'], ['ae', 'ARE', '阿联酋', 'United Arab Emirates', 'asia'], ['tr', 'TUR', '土耳其', 'Türkiye', 'asia'],
 ['am', 'ARM', '亚美尼亚', 'Armenia', 'asia'], ['az', 'AZE', '阿塞拜疆', 'Azerbaijan', 'asia'], ['ge', 'GEO', '格鲁吉亚', 'Georgia', 'asia'],
 ['kz', 'KAZ KAB', '哈萨克斯坦', 'Kazakhstan', 'asia'], ['kg', 'KGZ', '吉尔吉斯斯坦', 'Kyrgyzstan', 'asia'], ['tm', 'TKM', '土库曼斯坦', 'Turkmenistan', 'asia'],
 ['uz', 'UZB', '乌兹别克斯坦', 'Uzbekistan', 'asia'], ['vn', 'VNM', '越南', 'Vietnam', 'asia'], ['th', 'THA', '泰国', 'Thailand', 'asia'],
 ['mm', 'MMR', '缅甸', 'Myanmar', 'asia'], ['kh', 'KHM', '柬埔寨', 'Cambodia', 'asia'], ['la', 'LAO', '老挝', 'Laos', 'asia'],
 ['my', 'MYS', '马来西亚', 'Malaysia', 'asia'], ['sg', 'SGP', '新加坡', 'Singapore', 'asia'], ['id', 'IDN', '印度尼西亚', 'Indonesia', 'asia'],
 ['ph', 'PHL', '菲律宾', 'Philippines', 'asia'],
 // Africa
 ['eg', 'EGY', '埃及', 'Egypt', 'africa'], ['ly', 'LBY', '利比亚', 'Libya', 'africa'], ['dz', 'DZA', '阿尔及利亚', 'Algeria', 'africa'],
 ['ma', 'MAR', '摩洛哥', 'Morocco', 'africa'], ['tn', 'TUN', '突尼斯', 'Tunisia', 'africa'], ['sd', 'SDN', '苏丹', 'Sudan', 'africa'],
 ['et', 'ETH', '埃塞俄比亚', 'Ethiopia', 'africa'], ['er', 'ERI', '厄立特里亚', 'Eritrea', 'africa'], ['dj', 'DJI', '吉布提', 'Djibouti', 'africa'],
 ['so', 'SOM', '索马里', 'Somalia', 'africa'], ['ke', 'KEN', '肯尼亚', 'Kenya', 'africa'], ['ug', 'UGA', '乌干达', 'Uganda', 'africa'],
 ['tz', 'TZA', '坦桑尼亚', 'Tanzania', 'africa'], ['bi', 'BDI', '布隆迪', 'Burundi', 'africa'], ['cd', 'COD', '刚果（金）', 'DR Congo', 'africa'],
 ['cg', 'COG', '刚果（布）', 'Republic of the Congo', 'africa'], ['cm', 'CMR', '喀麦隆', 'Cameroon', 'africa'], ['cf', 'CAF', '中非', 'Central African Republic', 'africa'],
 ['ng', 'NGA', '尼日利亚', 'Nigeria', 'africa'], ['ne', 'NER', '尼日尔', 'Niger', 'africa'], ['ml', 'MLI', '马里', 'Mali', 'africa'],
 ['mr', 'MRT', '毛里塔尼亚', 'Mauritania', 'africa'], ['sn', 'SEN', '塞内加尔', 'Senegal', 'africa'], ['gn', 'GIN', '几内亚', 'Guinea', 'africa'],
 ['ci', 'CIV', '科特迪瓦', 'Côte d’Ivoire', 'africa'], ['gh', 'GHA', '加纳', 'Ghana', 'africa'], ['bf', 'BFA', '布基纳法索', 'Burkina Faso', 'africa'],
 ['bj', 'BEN', '贝宁', 'Benin', 'africa'], ['lr', 'LBR', '利比里亚', 'Liberia', 'africa'], ['ao', 'AGO', '安哥拉', 'Angola', 'africa'],
 ['na', 'NAM', '纳米比亚', 'Namibia', 'africa'], ['bw', 'BWA', '博茨瓦纳', 'Botswana', 'africa'], ['za', 'ZAF', '南非', 'South Africa', 'africa'],
 ['ls', 'LSO', '莱索托', 'Lesotho', 'africa'], ['mz', 'MOZ', '莫桑比克', 'Mozambique', 'africa'], ['mw', 'MWI', '马拉维', 'Malawi', 'africa'],
 // Americas
 ['ca', 'CAN', '加拿大', 'Canada', 'americas'], ['mx', 'MEX', '墨西哥', 'Mexico', 'americas'], ['gt', 'GTM', '危地马拉', 'Guatemala', 'americas'],
 ['bz', 'BLZ', '伯利兹', 'Belize', 'americas'], ['hn', 'HND', '洪都拉斯', 'Honduras', 'americas'], ['cr', 'CRI', '哥斯达黎加', 'Costa Rica', 'americas'],
 ['pa', 'PAN', '巴拿马', 'Panama', 'americas'], ['cu', 'CUB', '古巴', 'Cuba', 'americas'], ['jm', 'JAM', '牙买加', 'Jamaica', 'americas'],
 ['co', 'COL', '哥伦比亚', 'Colombia', 'americas'], ['ve', 'VEN', '委内瑞拉', 'Venezuela', 'americas'], ['gy', 'GUY', '圭亚那', 'Guyana', 'americas'],
 ['ec', 'ECU', '厄瓜多尔', 'Ecuador', 'americas'], ['pe', 'PER', '秘鲁', 'Peru', 'americas'], ['bo', 'BOL', '玻利维亚', 'Bolivia', 'americas'],
 ['br', 'BRA', '巴西', 'Brazil', 'americas'], ['ar', 'ARG', '阿根廷', 'Argentina', 'americas'], ['cl', 'CHL', '智利', 'Chile', 'americas'],
 ['uy', 'URY', '乌拉圭', 'Uruguay', 'americas'],
 // Oceania
 ['au', 'AUS', '澳大利亚', 'Australia', 'oceania'], ['nz', 'NZL', '新西兰', 'New Zealand', 'oceania'],
] as const satisfies readonly Entry[];

export type FlagPresetId = typeof ENTRIES[number][0];
export const FLAG_PRESET_IDS = ENTRIES.map(entry => entry[0]) as FlagPresetId[];
export interface FlagCatalogEntry {iso3: readonly string[]; names: readonly [zh: string, en: string]; region: FlagRegion}
export const FLAG_CATALOG = Object.freeze(Object.fromEntries(ENTRIES.map(([id, iso3, zh, en, region]): [string, FlagCatalogEntry] =>
 [id, {iso3: iso3.split(' '), names: [zh, en], region}]))) as unknown as Readonly<Record<FlagPresetId, FlagCatalogEntry>>;
/** Map-region country prefix (Natural Earth, e.g. "CHN" from "CHN-1150") → flag. */
export const FLAG_BY_ISO3: ReadonlyMap<string, FlagPresetId> = new Map(ENTRIES.flatMap(([id, iso3]) => iso3.split(' ').map(code => [code, id] as const)));
