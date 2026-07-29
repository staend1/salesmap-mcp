type FieldAliasRule = {
  canonical: string;
  aliases: readonly string[];
};

// LLM이 실제 스키마에 없는 자연어식 필드명을 만들어내는 케이스를 한 곳에서 관리한다.
// 실제로 같은 이름의 커스텀 필드가 존재하면 canonicalFieldName()이 먼저 보호한다.
export const FIELD_ALIAS_RULES: readonly FieldAliasRule[] = [
  {
    canonical: "이름",
    aliases: [
      "회사명", "회사 이름", "기업명", "업체명", "조직명", "조직 이름",
      "딜 이름", "딜명", "리드 이름", "리드명",
      "고객명", "고객 이름", "사람 이름", "담당자명",
      "name", "Name", "title", "Title",
    ],
  },
];

const FIELD_ALIAS_MAP = new Map<string, string>();
for (const rule of FIELD_ALIAS_RULES) {
  for (const alias of rule.aliases) {
    FIELD_ALIAS_MAP.set(alias, rule.canonical);
  }
}

// ── 한글 자모 오생성 교정 ────────────────────────────────
// LLM이 한글 음절을 만들 때 초성은 맞추고 중성·종성만 틀리는 사고가 관측된다.
// 텔레메트리 실측: 딜 담당자 -> 딥/딕/딸 담당자, 딜 목록 -> 딩 목록,
//                 첫 컨택 -> 첨 컨택, 이름 -> 이륨, 생성 날짜 -> 생씱 날짜
// 같은 세션 앞뒤에서는 올바른 이름을 쓰므로 "지식 부족"이 아니라 생성 오류다.
const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
// 평음<->경음은 같은 계열로 취급 (딜->딸, 생성->생씱에서 관측)
const TENSE_TO_PLAIN: Record<string, string> = { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" };

function choseongOf(ch: string): string | null {
  const o = ch.charCodeAt(0) - 0xac00;
  if (o < 0 || o >= 11172) return null;
  const c = CHOSEONG[Math.floor(o / 588)];
  return TENSE_TO_PLAIN[c] ?? c;
}

/** 같은 길이 + 한 글자만 다름 + 그 글자의 초성 계열이 같음 */
function isJamoTypo(a: string, b: string): boolean {
  if (a.length !== b.length || a.length < 2) return false;
  let diff = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (diff >= 0) return false;
    diff = i;
  }
  if (diff < 0) return false;
  const x = choseongOf(a[diff]);
  return x !== null && x === choseongOf(b[diff]);
}

/**
 * 후보 중 자모 오생성으로 보이는 것이 정확히 하나일 때만 교정한다.
 * 둘 이상이면 어느 쪽인지 알 수 없으므로 교정하지 않고 API 에러에 맡긴다.
 */
function findJamoTypo(name: string, candidates: Iterable<string>): string | null {
  let hit: string | null = null;
  for (const c of candidates) {
    if (!isJamoTypo(name, c)) continue;
    if (hit) return null;
    hit = c;
  }
  return hit;
}

export function canonicalFieldName(
  name: string,
  hasField: (n: string) => boolean,
  /** 자모 오생성 교정용 후보 목록. 넘기지 않으면 교정을 시도하지 않는다. */
  candidates?: Iterable<string>,
): string {
  if (hasField(name)) return name;

  const trimmed = name.trim();
  const canonical = FIELD_ALIAS_MAP.get(trimmed);
  if (canonical && hasField(canonical)) return canonical;

  if (candidates) {
    const fixed = findJamoTypo(trimmed, candidates);
    if (fixed) return fixed;
  }
  return name;
}
