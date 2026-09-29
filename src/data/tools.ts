export type ToolStatus = 'live' | 'soon';

export interface FaqItem {
  q: string;
  a: string;
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
  faq: FaqItem[];
  /** Copywriting reference only. Never emitted as a meta keywords tag. */
  keywords: string[];
}

export const TOOLS: Tool[] = [
  {
    slug: 'pdf-merge',
    name: 'PDF 합치기',
    title: 'PDF 합치기 — 업로드 없이 브라우저에서 무료로 | 안올림',
    description:
      '파일 업로드 없이 브라우저에서 PDF 합치기. 여러 PDF를 원하는 순서로 한 파일로 묶고 서식·책갈피·링크도 그대로 유지합니다. 회원가입 없이 무료.',
    h1: 'PDF 합치기',
    summary: '여러 PDF를 한 파일로 묶고, 파일 순서를 원하는 대로 바꾸세요.',
    icon: '<path d="M7 3h7l4 4v11H7z"/><path d="M4 6v15h11"/>',
    status: 'live',
    faq: [
      {
        q: '파일 크기나 개수에 제한이 있나요?',
        a: '한 번에 최대 50개 파일까지 합칠 수 있습니다. 처리는 기기 메모리로 하므로 PC에서는 합계 500 MB, 휴대폰에서는 합계 150 MB까지 받습니다. PC에서 200 MB 또는 1,500쪽, 휴대폰에서 50 MB를 넘으면 시간이 오래 걸릴 수 있어 먼저 확인을 요청합니다.',
      },
      {
        q: '비밀번호가 걸린 PDF도 합칠 수 있나요?',
        a: '네. 파일을 열 때 쓰는 비밀번호를 입력하면 합칠 수 있습니다. 비밀번호는 이 화면의 메모리에만 잠시 머무르고 저장되지 않습니다. 합친 파일에는 비밀번호가 걸려 있지 않습니다.',
      },
      {
        q: '입력 칸(서식), 책갈피, 문서 안 링크도 유지되나요?',
        a: '네. 입력할 수 있는 서식 칸은 그대로 입력할 수 있게 유지하고, 이름이 겹치는 칸은 이름을 바꿔 서로 섞이지 않게 합니다. 원본 책갈피와 문서 안 링크도 합친 파일의 올바른 쪽을 가리키도록 옮깁니다.',
      },
      {
        q: '휴대폰에서도 쓸 수 있나요?',
        a: '네. 휴대폰 브라우저에서도 같은 방법으로 쓸 수 있습니다. 다만 휴대폰은 메모리가 적어 합계 50 MB가 넘으면 먼저 확인을 요청하고, 150 MB가 넘으면 나눠서 합치도록 안내합니다.',
      },
      {
        q: '합친 파일은 어디에 저장되나요?',
        a: '내려받기 버튼을 누르면 브라우저의 기본 다운로드 폴더에 저장됩니다. 안올림 서버에는 원본도 결과물도 저장되지 않습니다.',
      },
    ],
    keywords: ['pdf 합치기', 'pdf 병합', 'pdf 파일 합치기'],
  },
  {
    slug: 'pdf-compress',
    name: 'PDF 용량 줄이기',
    title: 'PDF 용량 줄이기 — 업로드 없이 브라우저에서 무료로 | 안올림',
    description: '',
    h1: 'PDF 용량 줄이기',
    summary: '제출 용량 제한에 맞게 PDF를 줄입니다. 글자는 선택·검색 가능한 상태로 유지합니다.',
    icon: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 14l3 3 3-3M12 10v7"/>',
    status: 'soon',
    faq: [],
    keywords: ['pdf 용량 줄이기', 'pdf 압축'],
  },
  {
    slug: 'photo-compress',
    name: '사진 용량 줄이기',
    title: '사진 용량 줄이기 — 업로드 없이 브라우저에서 무료로 | 안올림',
    description: '',
    h1: '사진 용량 줄이기',
    summary: '원하는 KB에 맞춰 사진을 줄이면서 화질은 최대한 지킵니다.',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
    status: 'soon',
    faq: [],
    keywords: ['사진 용량 줄이기', 'jpg 용량 줄이기'],
  },
  {
    slug: 'id-photo',
    name: '여권·증명사진 규격 맞추기',
    title: '여권·증명사진 규격 맞추기 — 업로드 없이 브라우저에서 무료로 | 안올림',
    description: '',
    h1: '여권·증명사진 규격 맞추기',
    summary: '정부24·외교부 온라인 제출 규격에 맞게 자르고 크기와 용량을 맞춥니다. 보정은 하지 않습니다.',
    icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7.5 18c1-2.5 2.6-3.5 4.5-3.5s3.5 1 4.5 3.5"/>',
    status: 'soon',
    faq: [],
    keywords: ['여권사진 규격', '증명사진 사이즈'],
  },
  {
    slug: 'hwp-to-pdf',
    name: '한글(HWP) → PDF 변환',
    title: 'HWP PDF 변환 — 업로드 없이 브라우저에서 무료로 | 안올림',
    description: '',
    h1: 'HWP PDF 변환',
    summary: '한글 프로그램 없이 HWP·HWPX 문서를 열어 보고 PDF로 저장하세요.',
    icon: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 12h6M9 15h6M9 18h4"/>',
    status: 'soon',
    faq: [],
    keywords: ['hwp pdf 변환', '한글 pdf 변환'],
  },
];

export const LIVE_TOOLS = TOOLS.filter((t) => t.status === 'live');

export function getTool(slug: string): Tool {
  const t = TOOLS.find((x) => x.slug === slug);
  if (!t) throw new Error(`unknown tool: ${slug}`);
  return t;
}
