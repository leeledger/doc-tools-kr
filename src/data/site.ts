export const SITE = {
  name: '안올림',
  tagline: '파일을 올리지 않는 서류 도구',
  defaultTitle: '안올림 — 파일을 올리지 않는 서류 도구',
  defaultDescription:
    'PDF 합치기, PDF 용량 줄이기, 사진 용량 줄이기, 여권·증명사진 규격 맞추기, HWP를 PDF로 변환. 파일은 서버로 전송되지 않고 내 브라우저 안에서만 처리됩니다.',
  ogDescription: 'PDF·사진·한글 파일을 내 브라우저 안에서 바로 처리합니다. 업로드 없음, 회원가입 없음.',
  themeColor: '#0f766e',
  locale: 'ko_KR',
} as const;

/** Ads stay off in this phase. AdSlot renders nothing while this is false. */
export const ADS_ENABLED = false;

/** Search-console verification tokens. Meta tags render only when set. */
export const VERIFICATION = {
  naver: import.meta.env.PUBLIC_NAVER_SITE_VERIFICATION as string | undefined,
  google: import.meta.env.PUBLIC_GOOGLE_SITE_VERIFICATION as string | undefined,
};

export const TITLE_SUFFIX = '업로드 없이 브라우저에서 무료로 | 안올림';
