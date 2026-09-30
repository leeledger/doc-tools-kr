// The three compression levels as the page names them (also read by src/data/tool-facts.ts for the guides).
export const LEVEL_COPY = [
  { value: 'high', label: '고화질 (적게 줄이기)', desc: '인쇄용 선명도 (약 200 ppi). 원본과 거의 구분되지 않아 인쇄할 문서에 알맞습니다.' },
  { value: 'recommended', label: '권장', desc: '제출용 선명도 (약 150 ppi). 화면과 일반 인쇄에서 선명하게 읽혀 제출용 서류에 알맞습니다.' },
  { value: 'strong', label: '강력', desc: '화면용 선명도 (약 110 ppi). 화면에서는 읽을 수 있지만 확대하면 흐려질 수 있습니다.' },
] as const;

/** 목표 용량 chips (Polish P.13); MB × 1,000,000 bytes. */
export const TARGET_CHIPS = ['3', '5', '10', '20'] as const;
