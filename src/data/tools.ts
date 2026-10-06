import { PASSPORT_CHECK_URL, PASSPORT_RULE_URL, RETRIEVED, presetSummary } from './id-photo-presets';
import { LIMITS as HWP_LIMITS, MB_DEC } from '../lib/hwp/limits';
import { MB } from '../lib/ui/device';
import { LIMITS as JPG_PDF_LIMITS } from '../tools/jpg-to-pdf/limits';

/** HWP numbers in the /hwp-viewer/ FAQ, read from the limits the tool uses (MB = 1,000,000 bytes). */
const hwpMb = (bytes: number): string => `${(bytes / MB_DEC).toLocaleString('ko-KR')} MB`;
const HWP_FAQ = {
  openPhone: hwpMb(HWP_LIMITS.mobile.hardBytes),
  openPc: hwpMb(HWP_LIMITS.desktop.hardBytes),
  pdfPhone: hwpMb(HWP_LIMITS.mobile.capBytes),
  pdfPhonePages: `${HWP_LIMITS.mobile.capPages.toLocaleString('ko-KR')}쪽`,
} as const;

/** 사진 PDF 변환 numbers in its FAQ, read from the limits the tool uses (MB = 1,048,576 bytes, as in the tool). */
const n = (x: number): string => x.toLocaleString('ko-KR');
const JPG_PDF_FAQ = {
  imagesPc: `${n(JPG_PDF_LIMITS.desktop.maxImages)}장`,
  imagesPhone: `${n(JPG_PDF_LIMITS.mobile.maxImages)}장`,
  filePc: `${n(JPG_PDF_LIMITS.desktop.maxFileBytes / MB)} MB`,
  filePhone: `${n(JPG_PDF_LIMITS.mobile.maxFileBytes / MB)} MB`,
  totalPc: `${n(JPG_PDF_LIMITS.desktop.maxTotalBytes / MB)} MB`,
  totalPhone: `${n(JPG_PDF_LIMITS.mobile.maxTotalBytes / MB)} MB`,
  edgePhone: `${n(JPG_PDF_LIMITS.mobile.maxEdge)}픽셀`,
} as const;

export type ToolStatus = 'live' | 'soon';

export interface FaqItem {
  q: string;
  a: string;
  /** A source or next-step link shown after the answer (rendered by the tool page). */
  links?: { href: string; text: string }[];
}

export interface Tool {
  slug: string;
  /** Short tool name, used on cards and in breadcrumbs. */
  name: string;
  /** Full document title. */
  title: string;
  /** Meta description, 80–120 characters, contains the exact search keyword. */
  description: string;
  h1: string;
  /** Card copy on the home page. */
  summary: string;
  icon: string;
  status: ToolStatus;
  /** Last real change of the page (YYYY-MM-DD): the sitemap lastmod. Hand-maintained (docs/COPY.md release checklist). */
  updated: string;
  faq: FaqItem[];
  /** Copywriting reference only. Never emitted as a meta keywords tag. */
  keywords: string[];
}

/**
 * 배경 지우기 (Sprint C, C2). In TOOLS only when the release flag is on (PUBLIC_BG_REMOVE, scripts/lib/bgremove.mjs):
 * with it off there is no page, so no nav link, card, sitemap or llms.txt line may name it.
 * name = h1 (COPY.md rule, as C1); the brief's shorter name "배경 지우기" would break it.
 */
export const BG_REMOVE_TOOL: Tool = {
  slug: 'remove-background',
  name: '사진 배경 지우기 (누끼)',
  title: '사진 배경 지우기·누끼 따기 무료 — 투명 PNG | 문서딱',
  // C2-cloud (brief §7.2, owner-approved 2026-10-02): with the cloud path on, the description and two answers say
  // that a reduced copy is sent by default and how not to send it.
  description:
    '사진 배경 지우기와 누끼 따기를 무료로. 사람·상품·반려동물 사진에서 배경을 지워 투명한 PNG나 흰색·파란색 배경으로 저장합니다. 가입 없이 바로 씁니다.',
  h1: '사진 배경 지우기 (누끼)',
  summary: '사진 배경을 지워 투명한 PNG나 흰 배경 사진으로 저장합니다.',
  // Short on purpose: the icon is in every page's menu, and C2 may not grow the precache (Arch ruling 3).
  icon: '<circle cx="12" cy="9" r="4"/><path d="M4 21a8 7 0 0 1 16 0" stroke-dasharray="2 2"/>',
  status: 'live',
  updated: '2026-10-02',
  faq: [
    {
      q: '누끼 따기는 어떻게 하나요?',
      a: __BG_CLOUD__
        ? '사진을 고르고 「배경 지우기」를 누르면 사람이나 물건을 찾아 배경을 지웁니다. 「사진을 보내지 않고 기기에서 처리」를 고르면 이 기기 안에서 지우는데, 처음 한 번은 배경을 지우는 프로그램을 받아야 해서 받기 전에 크기를 알려 드리고 먼저 묻습니다.'
        : '사진을 고르면 이 기기 안에서 사람이나 물건을 찾아 배경을 지웁니다. 처음 한 번은 배경을 지우는 프로그램을 받아야 해서, 받기 전에 크기를 알려 드리고 먼저 묻습니다. 한 번 받으면 이 기기에 남아 다음부터는 바로 시작합니다.',
    },
    {
      q: '잘 맞는 사진은요?',
      a: '상품, 프로필 사진, 반려동물, 자동차처럼 하나가 크게 나온 사진을 문서나 발표 자료에 넣을 때 잘 맞습니다. 유리나 투명한 물건, 여러 사람이 함께 나온 사진, 복잡한 배경은 잘 안 될 수 있습니다. 종이에 찍은 도장·서명·로고는 전자서명·도장 이미지 만들기가 더 잘 맞습니다.',
      links: [{ href: '/stamp-signature/', text: '전자서명·도장 이미지 만들기' }],
    },
    {
      q: '저장되는 사진의 크기는요?',
      a: 'PC에서는 긴 변 4,096픽셀, 휴대폰에서는 긴 변 2,048픽셀까지 고른 사진 크기 그대로 저장합니다. 그보다 큰 사진은 이 크기로 줄여 저장합니다.',
    },
    {
      q: '배경을 흰색이나 파란색으로 바꿀 수 있나요?',
      a: '네. 투명, 흰색, 파란색 중에서 고를 수 있습니다. 투명은 PNG로, 흰색·파란색은 JPG로 저장하고 PNG로도 저장할 수 있습니다. 상품 사진이나 프로필 사진, 문서·발표 자료에 넣을 그림에 쓰세요.',
    },
    {
      // C2 round 2 (Arch): never positioned for ID photos. 외교부, https://www.passport.go.kr/home/kor/contents.do?menuPos=12
      // (제출 불가한 사진파일 안내): "배경이 흰색이 아니거나, 배경색을 사진 편집 프로그램으로 제거하여 사진이 변형된 경우"
      q: '여권·증명사진에 써도 되나요?',
      a: '아니요. 여권·증명사진 제출용으로는 쓰지 마세요. 외교부 여권 안내는 배경색을 사진 편집 프로그램으로 제거하여 사진이 변형된 경우를 제출할 수 없는 사진으로 정하고 있습니다. 여권·증명사진은 흰 배경에서 찍은 사진을 그대로 쓰세요.',
      links: [{ href: 'https://www.passport.go.kr/home/kor/contents.do?menuPos=12', text: '외교부 여권안내: 제출 불가한 사진파일 안내' }],
    },
    {
      q: '제 사진이 어디로 보내지나요?',
      a: __BG_CLOUD__
        ? '기본은 줄인 사진 1장을 보내 배경을 지우고, 결과를 돌려받은 뒤 바로 지워요. "사진을 보내지 않고 기기에서 처리"를 고르면 어디로도 보내지 않아요.'
        : '어디로도 보내지 않습니다. 사진은 이 기기 안에서만 처리되고, 처음 한 번 배경을 지우는 프로그램만 받습니다.',
      ...(__BG_CLOUD__ ? { links: [{ href: '/privacy/#bg', text: '개인정보 처리방침: 배경 지우기에서 사진을 보내는 경우' }] } : {}),
    },
  ],
  keywords: ['배경 지우기', '누끼 따기', '사진 배경 제거', '배경 투명하게', '누끼'],
};

export const TOOLS: Tool[] = [
  {
    slug: 'pdf-merge',
    name: 'PDF 합치기',
    title: 'PDF 합치기·병합 무료 — 설치 없이 바로 | 문서딱',
    description:
      'PDF 합치기를 폰·컴퓨터에서 바로. 여러 PDF를 원하는 순서로 한 파일로 묶고 서식·책갈피·링크도 그대로 유지합니다. 설치·가입 없이 무료.',
    h1: 'PDF 합치기',
    summary: '여러 PDF를 한 파일로 묶고, 파일 순서를 원하는 대로 바꾸세요.',
    icon: '<path d="M7 3h7l4 4v11H7z"/><path d="M4 6v15h11"/>',
    status: 'live',
    updated: '2026-09-30',
    faq: [
      {
        q: '파일 크기나 개수에 제한이 있나요?',
        a: '한 번에 최대 50개 파일까지 합칠 수 있습니다. 이 기기 안에서 처리하므로 PC에서는 합계 500 MB, 휴대폰에서는 합계 150 MB까지 받습니다. PC에서 200 MB 또는 1,500쪽, 휴대폰에서 50 MB를 넘으면 시간이 오래 걸릴 수 있어 먼저 확인을 요청합니다.',
      },
      {
        q: '비밀번호가 걸린 PDF도 합칠 수 있나요?',
        a: '네. 파일을 열 때 쓰는 비밀번호를 입력하면 합칠 수 있습니다. 비밀번호는 이 화면을 보는 동안에만 쓰이고 저장되지 않습니다. 합친 파일에는 비밀번호가 걸려 있지 않습니다.',
      },
      {
        q: '입력 칸(서식), 책갈피, 문서 안 링크도 유지되나요?',
        a: '네. 입력할 수 있는 서식 칸은 그대로 입력할 수 있게 유지하고, 이름이 겹치는 칸은 이름을 바꿔 서로 섞이지 않게 합니다. 원본 책갈피와 문서 안 링크도 합친 파일의 올바른 쪽을 가리키도록 옮깁니다.',
      },
      {
        q: '휴대폰에서도 쓸 수 있나요?',
        a: '네. 휴대폰에서도 같은 방법으로 쓸 수 있습니다. 다만 휴대폰은 PC보다 한 번에 처리할 수 있는 양이 적어 합계 50 MB가 넘으면 먼저 확인을 요청하고, 150 MB가 넘으면 나눠서 합치도록 안내합니다.',
      },
      {
        q: '합친 파일은 어디에 저장되나요?',
        a: '내려받기 버튼을 누르면 휴대폰·PC의 「다운로드」 폴더에 저장됩니다. 문서딱은 원본도 결과물도 따로 보관하지 않습니다.',
      },
    ],
    keywords: ['pdf 합치기', 'pdf 병합', 'pdf 파일 합치기'],
  },
  {
    slug: 'pdf-compress',
    name: 'PDF 용량 줄이기',
    title: 'PDF 용량 줄이기 무료 — 제출 용량에 맞게 | 문서딱',
    description:
      'PDF 용량 줄이기를 폰·컴퓨터에서 바로. 스캔·사진이 든 PDF를 선명하게 유지하면서 줄이고, 글자는 선택·검색 가능한 그대로 둡니다. 가입 없이 무료.',
    h1: 'PDF 용량 줄이기',
    summary: '제출 용량 제한에 맞게 PDF를 줄입니다. 글자는 선택·검색 가능한 상태로 유지합니다.',
    icon: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 14l3 3 3-3M12 10v7"/>',
    status: 'live',
    updated: '2026-09-30',
    faq: [
      {
        q: '얼마나 줄어드나요?',
        a: '시험한 파일 기준으로 스캔하거나 사진이 들어간 PDF는 권장 단계에서 85–96% 줄었고, 글자 위주 문서는 4–25% 줄었습니다. 이미 작게 저장된 파일은 더 줄지 않을 수 있으며, 그때는 원본을 그대로 둡니다.',
      },
      {
        q: '글자가 흐려지나요?',
        a: '아니요. 고화질·권장·강력 세 단계는 글자와 선을 이미지로 바꾸지 않고 그대로 두므로, 줄인 뒤에도 글자를 선택하고 검색할 수 있습니다. "이미지로 변환"을 고른 경우에만 모든 쪽이 이미지가 됩니다.',
      },
      {
        q: '비밀번호가 걸린 PDF도 줄일 수 있나요?',
        a: '네. 파일을 열 때 쓰는 비밀번호를 입력하면 줄일 수 있습니다. 비밀번호는 이 화면을 보는 동안에만 쓰이고 저장되지 않습니다. 줄인 파일에는 비밀번호가 걸려 있지 않습니다.',
      },
      {
        q: '파일 크기에 제한이 있나요?',
        a: '이 기기 안에서 처리하므로 PC에서는 100 MB, 휴대폰에서는 50 MB까지 줄일 수 있습니다. PC에서 40 MB 또는 1,000쪽, 휴대폰에서 20 MB 또는 300쪽을 넘으면 시간이 오래 걸릴 수 있어 먼저 확인을 요청합니다. 이미지로 변환은 PC에서 500쪽, 휴대폰에서 100쪽까지 할 수 있습니다.',
      },
      {
        q: '전자서명이 있는 문서나 발급받은 증명서도 줄여도 되나요?',
        a: '용량을 줄이면 파일이 새로 저장되어 전자서명이 더 이상 유효하지 않습니다. 발급받은 증명서처럼 서명이 필요한 문서는 원본을 제출하세요. 전자서명이 들어 있는 파일이면 결과 화면에서 알려 드립니다.',
      },
      {
        q: '휴대폰에서도 되나요?',
        a: '네. 휴대폰에서도 같은 방법으로 줄일 수 있습니다. 다만 휴대폰은 PC보다 한 번에 처리할 수 있는 양이 적어 20 MB가 넘는 파일은 먼저 확인을 요청하고, 50 MB가 넘는 파일은 PC에서 줄이도록 안내합니다.',
      },
    ],
    keywords: ['pdf 용량 줄이기', 'pdf 압축', 'pdf 파일 용량 줄이기'],
  },
  {
    // TOOLS4 T2. name = h1 (COPY.md). No release flag (brief decision 1): static, sends nothing, one revert rolls it back.
    slug: 'jpg-to-pdf',
    name: '사진 PDF 변환',
    title: '사진 PDF 변환 — JPG·PNG·아이폰 사진을 PDF 하나로 무료 | 문서딱',
    description:
      '사진 PDF 변환을 폰·컴퓨터에서 바로. JPG·PNG·아이폰 사진 여러 장을 원하는 순서로 PDF 하나로 묶고, A4 용지나 사진 크기에 맞춥니다. 가입 없이 무료.',
    h1: '사진 PDF 변환',
    summary: '사진 여러 장을 원하는 순서로 PDF 파일 하나로 묶습니다. A4 용지에 맞출 수도 있습니다.',
    icon: '<rect x="3" y="4" width="11" height="9" rx="1.5"/><path d="M3 11l3-3 3 3 2-2 3 3"/><path d="M10 13v8h11V9h-4"/>',
    status: 'live',
    updated: '2026-10-06',
    faq: [
      {
        q: '사진 여러 장을 PDF 하나로 묶을 수 있나요?',
        a: `네. 한 번에 PC에서는 ${JPG_PDF_FAQ.imagesPc}, 휴대폰에서는 ${JPG_PDF_FAQ.imagesPhone}까지 넣을 수 있고, 사진 한 장이 PDF 한 쪽이 됩니다. 위로·아래로 버튼이나 왼쪽 손잡이를 끌어 순서를 정하고, 옆으로 누운 사진은 돌리기 버튼으로 세울 수 있습니다.`,
      },
      {
        q: 'A4 크기로 만들 수 있나요?',
        a: '네. 용지에서 A4를 고르면 사진을 비율 그대로 A4 한 쪽 안에 맞춰 넣습니다. 방향이 「자동」이면 가로로 긴 사진은 가로 A4에, 「세로」를 고르면 모두 세로 A4에 넣습니다. 「사진 크기에 맞춤」을 고르면 쪽 모양이 사진 모양과 같아 여백이 없습니다.',
      },
      {
        q: '아이폰 사진(HEIC)도 되나요?',
        a: '아이폰 사진 형식(HEIC)은 기기나 앱에 따라 열리지 않을 수 있습니다. 그럴 때는 아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」을 고르거나, 사진을 JPG로 내보낸 뒤 다시 선택해 주세요.',
      },
      {
        q: '화질이 떨어지나요?',
        a: `JPG 사진은 돌리거나 줄이지 않으면 원본 그대로 넣어 화질이 같습니다. 돌린 사진, 찍을 때 방향 정보가 담긴 사진, PNG·WebP 사진은 높은 화질로 다시 저장해 넣습니다. 휴대폰에서는 긴 변이 ${JPG_PDF_FAQ.edgePhone}보다 큰 사진을 다시 저장할 때 ${JPG_PDF_FAQ.edgePhone}로 줄입니다. PDF 용량을 줄이려면 사진 크기에서 「줄이기」를 고르세요.`,
        links: [{ href: '/pdf-compress/', text: 'PDF 용량 줄이기' }],
      },
      {
        q: '휴대폰에서도 되나요? 크기 제한이 있나요?',
        a: `네. 휴대폰에서도 같은 방법으로 만들 수 있습니다. 사진 한 장은 PC에서 ${JPG_PDF_FAQ.filePc}, 휴대폰에서 ${JPG_PDF_FAQ.filePhone}까지, 모두 합쳐 PC에서 ${JPG_PDF_FAQ.totalPc}, 휴대폰에서 ${JPG_PDF_FAQ.totalPhone}까지 넣을 수 있습니다.`,
      },
      {
        q: '제 사진이 어디로 보내지나요?',
        a: '어디로도 보내지 않습니다. 사진은 이 기기 안에서 PDF로 만들어지고, 촬영 위치나 날짜 같은 사진 정보는 PDF에 넣지 않습니다.',
      },
    ],
    keywords: ['사진 pdf 변환', 'jpg pdf 변환', '아이폰 사진 pdf 변환', '사진 pdf로 묶기', 'png pdf 변환'],
  },
  {
    slug: 'photo-compress',
    name: '사진 용량 줄이기',
    title: '사진 용량 줄이기 — 100KB·200KB·KB 맞추기 무료 | 문서딱',
    description:
      '사진 용량 줄이기를 폰·컴퓨터에서 바로. 100KB·200KB·500KB 등 원하는 용량에 맞춰 화질은 최대한 지키고, 촬영 위치 같은 개인정보는 지웁니다. 가입 없이 무료.',
    h1: '사진 용량 줄이기',
    summary: '원하는 KB에 맞춰 사진을 줄이면서 화질은 최대한 지킵니다.',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
    status: 'live',
    updated: '2026-09-30',
    faq: [
      {
        q: '원하는 KB 이하로 정확히 맞출 수 있나요?',
        a: '네. 결과 파일은 항상 고른 용량과 같거나 그보다 작습니다. 1 KB를 1,000바이트로 계산하므로 1 KB를 1,024바이트로 세는 사이트에서도 제한을 넘지 않습니다. 목표 용량이 아주 작으면 화질을 지나치게 낮추는 대신 사진의 가로·세로 크기를 줄여서 맞춥니다.',
      },
      {
        q: '화질이 많이 떨어지나요?',
        a: '화질은 사진이 깍두기처럼 깨지기 시작하는 수준 아래로 낮추지 않고, 더 줄여야 하면 사진 크기를 줄입니다. 저장할 때는 같은 용량에서 더 선명하게 저장하는 방식을 씁니다. 빠른 모드를 켜면 처리 시간이 짧은 대신 화질이 조금 낮습니다.',
      },
      {
        q: '증명사진 용량 줄이기에도 쓸 수 있나요?',
        a: '네. 200 KB, 500 KB처럼 용량 제한이 있는 증명사진 제출에 쓸 수 있고, 목표 용량의 직접 입력으로 원하는 KB를 넣을 수도 있습니다. 가로·세로 픽셀 수까지 정해져 있다면 여권·증명사진 규격 맞추기를 쓰세요.',
        links: [{ href: '/id-photo/', text: '여권·증명사진 규격 맞추기' }],
      },
      {
        q: '아이폰 사진(HEIC)도 되나요?',
        a: '아이폰 사진 형식(HEIC)은 기기나 앱에 따라 열리지 않을 수 있습니다. 그럴 때는 아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」을 고르거나, 사진을 JPG로 내보낸 뒤 다시 선택해 주세요.',
      },
      {
        q: 'PNG나 투명 배경 이미지도 되나요?',
        a: '네. PNG도 줄일 수 있으며 결과는 JPG로 저장되고, 투명한 부분은 흰색으로 채워집니다. 투명 배경을 유지하려면 저장 형식에서 WebP를 고르세요. 다만 제출하는 곳이 WebP 파일을 받는지 먼저 확인하세요.',
      },
      {
        q: '여러 장을 한 번에, 휴대폰에서도 줄일 수 있나요?',
        a: '네. PC에서는 한 번에 50장, 휴대폰에서는 20장까지 줄일 수 있고, 결과는 한 장씩 또는 ZIP 파일 하나로 내려받습니다. 사진 한 장은 PC에서 100 MB, 휴대폰에서 50 MB까지 받습니다. 휴대폰에서는 긴 변이 4,096픽셀보다 큰 사진을 4,096픽셀로 줄여서 처리합니다.',
      },
    ],
    keywords: ['사진 용량 줄이기', '이미지 용량 줄이기', '증명사진 용량 줄이기', '사진 kb 줄이기', 'jpg 용량 줄이기'],
  },
  {
    slug: 'id-photo',
    name: '여권·증명사진 규격 맞추기',
    title: '여권사진·증명사진 사이즈 규격 맞추기 무료 | 문서딱',
    description:
      '여권사진 규격(413×531 픽셀, 500KB 이하)과 공무원 시험·Q-Net·이력서 증명사진 사이즈에 맞춰 사진을 자르고 용량을 맞춥니다. 사진은 보정하지 않고, 가입 없이 무료입니다.',
    h1: '여권·증명사진 규격 맞추기',
    summary: '여권·시험·이력서 제출 규격에 맞게 사진을 자르고 크기와 용량을 맞춥니다. 보정은 하지 않습니다.',
    icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7.5 18c1-2.5 2.6-3.5 4.5-3.5s3.5 1 4.5 3.5"/>',
    status: 'live',
    updated: '2026-10-06',
    faq: [
      {
        q: '여권사진 규격이 어떻게 되나요?',
        a: `여권 사진은 가로 3.5 cm, 세로 4.5 cm입니다. 온라인 신청용 파일은 413×531 픽셀을 권장하며 가로 395–431, 세로 507–550 픽셀 안에서만 올릴 수 있고, JPG 형식에 500 KB 이하, 해상도 300을 권장합니다. 머리 길이는 정수리(머리카락 제외)부터 턱까지 3.2–3.6 cm이고, 흰색 배경에서 6개월 이내에 찍은 사진이어야 합니다. 외교부 안내 기준이며 ${RETRIEVED}에 확인했습니다.`,
        links: [{ href: PASSPORT_RULE_URL, text: '외교부 여권사진 규격 안내 (새 창)' }],
      },
      {
        q: '이 도구로 만들면 여권사진 심사를 통과하나요?',
        // A manual-only build (PUBLIC_ID_PHOTO_AUTOFRAME=0) never mentions auto-framing (Step 4 round 2).
        a: `통과를 보장하지 않습니다. 최종 적합 여부는 접수 기관 심사로 결정됩니다. ${
          __ID_PHOTO_AUTOFRAME__ ? '얼굴 위치 자동 맞춤은 추정값이어서, 안내선을 보고' : '안내선을 보고'
        } 정수리와 턱 위치를 직접 확인해야 저장할 수 있습니다. 제출 전에 외교부 「온라인 여권 사진 검증」에서 한 번 더 확인할 수 있으며, 그곳에서는 사진을 외교부로 보냅니다.`,
        links: [{ href: PASSPORT_CHECK_URL, text: '외교부 온라인 여권 사진 검증 (새 창)' }],
      },
      {
        q: '사진 보정이나 배경을 흰색으로 바꿀 수 있나요?',
        a: '아니요. 외교부는 「사진 편집 프로그램, 사진 필터 기능 등을 사용하여 임의로 보정된 사진(AI를 활용한 편집·가공·합성·창조 제작물 포함)은 허용 불가함」이라고 안내합니다. 이 도구는 자르기·기울기 조정·크기 조정·재압축만 합니다. 배경이 흰색이 아니면 흰 배경에서 다시 찍어 주세요.',
      },
      {
        q: '증명사진 사이즈는 제출처마다 다른가요?',
        a: `네. ${presetSummary()} 「인화용」이라고 적힌 곳은 기관이 종이 사진 크기만 정해 두어, 그 크기로 인화할 수 있는 파일로 맞춥니다. 목록에 없는 곳은 「직접 입력」으로 제출처 안내의 픽셀과 용량을 넣으세요.`,
      },
      {
        q: '증명사진 용량만 줄이고 싶어요.',
        a: '픽셀 크기는 정해져 있지 않고 KB만 맞추면 되는 곳이라면 사진 용량 줄이기를 쓰세요. 원하는 KB 이하로 화질을 최대한 지키며 줄입니다. 가로·세로 픽셀까지 정해져 있을 때 이 도구를 쓰세요.',
        links: [{ href: '/photo-compress/', text: '사진 용량 줄이기' }],
      },
      {
        q: '아이폰 사진(HEIC)도 되나요?',
        a: '아이폰 사진 형식(HEIC)은 기기나 앱에 따라 열리지 않을 수 있습니다. 그럴 때는 아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」을 고르거나, 사진을 JPG로 내보낸 뒤 다시 선택해 주세요.',
      },
    ],
    keywords: ['여권사진 규격', '여권사진', '증명사진 사이즈', '여권사진 사이즈', '증명사진 용량 줄이기'],
  },
  {
    // Sprint C, C1. name = h1 (COPY.md; the brief's shorter name "전자서명·도장 이미지" would break that rule).
    slug: 'stamp-signature',
    name: '전자서명·도장 이미지 만들기',
    title: '전자서명·도장 이미지 만들기 — 배경 없는 PNG 무료 | 문서딱',
    description:
      '도장 이미지 만들기와 전자서명 만들기를 무료로. 종이에 찍은 도장이나 쓴 서명 사진에서 배경을 지워 투명한 PNG로 저장합니다. 서명은 화면에 직접 그려도 됩니다.',
    h1: '전자서명·도장 이미지 만들기',
    summary: '도장·서명 사진의 배경을 지워 투명한 PNG 파일로 저장합니다. 서명은 직접 그려도 됩니다.',
    icon: '<rect x="4" y="15" width="16" height="5" rx="1"/><path d="M9 15v-3.5a3 3 0 1 1 6 0V15"/><path d="M7 23h10"/>',
    status: 'live',
    updated: '2026-10-02',
    faq: [
      {
        q: '전자서명 이미지는 어떻게 만드나요?',
        a: '흰 종이에 서명한 뒤 사진을 찍어 「사진으로 만들기」에서 고르면, 종이를 지우고 서명만 남긴 PNG 파일로 저장됩니다. 「직접 그리기」에서 손가락이나 마우스로 서명해도 됩니다.',
      },
      {
        q: '도장 이미지의 배경을 지울 수 있나요?',
        a: '네. 흰 종이에 도장을 찍고 환한 곳에서 찍은 사진을 고르면, 종이와 그림자를 지우고 도장만 남긴 투명 배경 PNG로 저장합니다. 도장 색은 사진 속 색 그대로 두며, 원하면 빨간색으로 맞출 수 있습니다.',
      },
      {
        q: '제대로 안 되는 사진도 있나요?',
        a: '질감 있는 종이나 색지 위의 흐린 도장은 번지거나 끊겨 보일 수 있습니다. 도장이 글자 위에 찍혀 있으면 겹친 부분이 비어 보일 수 있고, 광택 있는 종이의 빛 반사나 아주 어두운 사진도 제대로 안 될 수 있습니다. 그럴 때는 흰 종이에 다시 찍어 환한 곳에서 사진을 찍어 주세요.',
      },
      {
        q: '만든 이미지는 어디에 쓰나요?',
        a: '한글·워드 문서에 그림으로 넣을 수 있습니다. 이 도구는 이미지만 만들고, 법적 효력을 정하거나 본인 확인을 하지 않습니다. 본인 도장과 서명만 쓰세요.',
      },
      {
        q: '아이폰 사진(HEIC)도 되나요?',
        a: '아이폰 사진 형식(HEIC)은 기기나 앱에 따라 열리지 않을 수 있습니다. 그럴 때는 아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」을 고르거나, 사진을 JPG로 내보낸 뒤 다시 선택해 주세요.',
      },
    ],
    keywords: ['전자서명만들기', '온라인도장만들기', '도장이미지만들기', '전자도장', '도장배경제거', '싸인누끼', '도장누끼'],
  },
  ...(__BG_REMOVE__ ? [BG_REMOVE_TOOL] : []),
  {
    slug: 'hwp-to-pdf',
    name: 'HWP PDF 변환',
    title: '한글파일(HWP) PDF로 변환 — 한글 없이 무료 | 문서딱',
    description:
      '한글 프로그램 없이 hwp pdf 변환. 한글파일 PDF로 변환해 바로 내려받고, HWP·HWPX 문서를 뷰어처럼 열어 볼 수도 있습니다. 회원가입 없이 무료.',
    h1: 'HWP PDF 변환',
    summary: '한글 프로그램 없이 HWP·HWPX 문서를 열어 보고 PDF로 내려받으세요.',
    icon: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 12h6M9 15h6M9 18h4"/>',
    status: 'live',
    updated: '2026-10-01',
    faq: [
      {
        q: '한글 프로그램 없이 되나요?',
        a: '네. 한글 프로그램을 설치하지 않아도 이 페이지에서 HWP 문서를 열고 PDF 파일로 내려받을 수 있습니다.',
      },
      {
        q: 'HWPX도 되나요?',
        a: '네. HWPX 파일도 HWP와 같은 방법으로 열어 보고 PDF로 내려받을 수 있습니다. 예전 형식인 HWP 3.0 문서도 열 수 있습니다. HWPML(.hml) 문서는 열 수 없습니다.',
      },
      {
        q: '원본과 똑같이 나오나요?',
        a: '대부분의 문서는 원본과 같은 모양으로 나오지만, 글꼴이 달라 줄바꿈이나 쪽 나눔이 조금 다를 수 있습니다. 글상자·도형이 많은 문서와 100쪽 이상인 문서는 먼저 미리보기로 보여 드리고, 내려받기 전에 확인을 요청합니다.',
      },
      {
        q: '휴대폰에서도 되나요?',
        a: '네. 다만 휴대폰은 PC보다 한 번에 처리할 수 있는 양이 적어 10 MB 또는 60쪽이 넘는 문서는 보기만 할 수 있고, 25 MB가 넘는 파일은 열 수 없습니다. PC에서는 80 MB, 300쪽까지 PDF로 내려받을 수 있습니다.',
      },
      {
        q: '제 문서가 어디로 보내지나요?',
        a: '어디로도 보내지 않습니다. 문서는 이 기기 안에서만 열립니다.',
      },
      {
        q: '비밀번호가 걸린 문서는요?',
        a: '비밀번호가 걸린 문서는 열 수 없습니다. 한글 프로그램에서 암호를 해제한 뒤 다시 시도해 주세요. 배포용 문서도 열리지 않을 수 있습니다.',
      },
      {
        q: 'PDF는 어디에 저장되나요?',
        a: '휴대폰·PC의 「다운로드」 폴더에 원래 파일 이름 그대로(확장자만 .pdf) 저장됩니다.',
      },
      {
        q: 'HWP 뷰어로만 써도 되나요?',
        a: '네. 파일을 고르면 PDF로 내려받지 않아도 모든 쪽을 바로 볼 수 있어 HWP 뷰어처럼 쓸 수 있습니다.',
      },
    ],
    keywords: ['hwp pdf 변환', '한글파일 pdf로 변환', '한글파일 pdf 변환', 'hwp 뷰어', 'hwpx 변환', 'hwpx 열기'],
  },
  {
    slug: 'hwp-viewer',
    name: 'HWP·HWPX 파일 보기',
    title: 'HWP 뷰어 — 한글 파일(.hwp·.hwpx) 설치 없이 열기 | 문서딱',
    description:
      'hwp 뷰어를 설치 없이 바로. 한글 파일(HWP·HWPX)을 폰·컴퓨터에서 바로 열어 쪽을 넘겨 보고, 글자를 찾아 복사합니다. hwpx 열기도 되고, 가입 없이 무료입니다.',
    h1: 'HWP·HWPX 파일 보기',
    summary: '한글 프로그램 없이 HWP·HWPX 문서를 열어 쪽을 넘겨 보고, 글자를 찾아 보세요.',
    icon: '<path d="M6 3h8l4 4v14H6z"/><path d="M8 15s1.6-2.6 4-2.6 4 2.6 4 2.6-1.6 2.6-4 2.6S8 15 8 15z"/><circle cx="12" cy="15" r="1"/>',
    status: 'live',
    updated: '2026-10-01',
    faq: [
      {
        q: '휴대폰에서도 열 수 있나요?',
        a: `네. 휴대폰에서도 같은 방법으로 열어 볼 수 있습니다. 휴대폰의 「파일」 앱이나 다운로드 폴더에서 문서를 고르세요. 휴대폰은 PC보다 한 번에 처리할 수 있는 양이 적어 ${HWP_FAQ.openPhone}가 넘는 파일은 열 수 없습니다. PC에서는 ${HWP_FAQ.openPc}까지 열 수 있습니다.`,
      },
      {
        q: 'HWPX 파일도 열 수 있나요?',
        a: '네. HWPX 파일도 HWP와 같은 방법으로 열 수 있습니다. 예전 형식인 HWP 3.0 문서도 열립니다. HWPML(.hml) 문서는 열 수 없습니다.',
      },
      {
        q: '원본과 다르게 보이는 이유는요?',
        a: '문서에 쓴 글꼴이 없으면 다른 글꼴로 보여 드리므로 줄바꿈이나 쪽 나눔이 조금 다를 수 있습니다. 수식이 들어 있거나 글상자·도형이 많은 문서는 모양과 위치가 원본과 다를 수 있습니다.',
      },
      {
        q: '글자를 복사할 수 있나요?',
        a: '네. 문서의 글자를 골라 복사할 수 있습니다. 「찾기」를 누르면 문서 안의 단어를 찾아 그 쪽으로 옮겨 드립니다.',
      },
      {
        q: '프로그램을 설치해야 하나요?',
        a: '아니요. 이 페이지에서 바로 열리므로 한글 프로그램이나 다른 앱을 설치하지 않아도 됩니다. 회원가입도 필요 없습니다.',
      },
      {
        q: 'PDF로도 저장할 수 있나요?',
        a: `네. 문서를 연 뒤 「PDF로 내려받기」를 누르면 문서를 다시 고르지 않고 PDF 파일로 저장됩니다. 휴대폰에서는 ${HWP_FAQ.pdfPhone} 또는 ${HWP_FAQ.pdfPhonePages}이 넘는 문서는 보기만 할 수 있습니다.`,
      },
      {
        q: '제 문서가 어디로 보내지나요?',
        a: '어디로도 보내지 않습니다. 문서는 이 기기 안에서만 열립니다.',
      },
      {
        q: '한글과컴퓨터에서 만든 도구인가요?',
        a: '아닙니다. 문서딱은 한글과컴퓨터와 무관합니다. 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.',
      },
    ],
    keywords: ['hwp 뷰어', 'hwpx 열기', '한글파일 열기', '한글 없이 hwp 열기', '휴대폰 hwp 열기', '아이폰 hwp 열기'],
  },
];

export const LIVE_TOOLS = TOOLS.filter((t) => t.status === 'live');

export function getTool(slug: string): Tool {
  const t = TOOLS.find((x) => x.slug === slug);
  if (!t) throw new Error(`unknown tool: ${slug}`);
  return t;
}

/** Home <title> (Growth: traffic first). Keyword-bearing; kept here so tool names live only in tools.ts. */
export const HOME_TITLE = 'PDF 합치기·용량 줄이기, 사진 용량·증명사진 규격, 한글 PDF 변환 무료 | 문서딱';
