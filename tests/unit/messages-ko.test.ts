// EN0 (brief handoff/ARCHITECT-BRIEF-EN.md): the Korean catalogs hold exactly the strings the controllers showed before
// the move. Expected values are the literals of the pre-EN0 sources (controller.ts, limits.ts), with sample arguments.
import { describe, expect, it } from 'vitest';
import { ERRORS } from '../../src/lib/image/messages';
import { MB } from '../../src/lib/ui/device';
import { ENGINE_KO, engineErrorCopy } from '../../src/lib/ui/engine-load';
import { formatPages } from '../../src/lib/ui/format';
import { NEXT_GROUP_LABEL, NEXT_KO, NEXT_LABELS, sendFailed } from '../../src/lib/ui/next-steps';
import { nonPdfMessage } from '../../src/lib/ui/pdf-pick';
import { noteText } from '../../src/tools/image-to-jpg/convert';
import { KO as IJ } from '../../src/tools/image-to-jpg/messages.ko';
import { compressedFileName } from '../../src/tools/pdf-compress/format';
import { KO as CMP } from '../../src/tools/pdf-compress/messages.ko';
import { TARGET_COPY, TARGET_RANGE_MESSAGE } from '../../src/tools/pdf-compress/target';
import { mergedFileName } from '../../src/tools/pdf-merge/format';
import { KO as MERGE } from '../../src/tools/pdf-merge/messages.ko';

const ENGINE_BODY = (when: string) => `파일에는 문제가 없습니다. ${when} 새로고침해 주세요. 새로고침하면 파일을 다시 골라야 합니다.`;

describe('shared catalog entries', () => {
  it('ENGINE_KO is the copy engineErrorCopy gave per state', async () => {
    expect(ENGINE_KO.offline).toEqual({ title: '인터넷 연결이 끊겨 처리 도구를 불러오지 못했습니다.', body: ENGINE_BODY('연결을 확인한 뒤') });
    expect(ENGINE_KO.deployed).toEqual({ title: '사이트가 방금 새 버전으로 바뀌었습니다.', body: ENGINE_BODY('바로') });
    expect(ENGINE_KO.generic).toEqual({ title: '처리 도구를 불러오지 못했습니다.', body: ENGINE_BODY('잠시 뒤') });
    expect(ENGINE_KO.reload).toBe('새로고침');
    expect(await engineErrorCopy({ online: false })).toEqual(ENGINE_KO.offline);
  });

  it('NEXT_KO is the next-steps copy', () => {
    expect(NEXT_KO).toEqual({ group: NEXT_GROUP_LABEL, labels: NEXT_LABELS, sendFailed });
    expect(NEXT_KO.group).toBe('이 파일로 이어서 하기');
  });

  it('the three Korean catalogs reuse the shared Korean copy (one source)', () => {
    for (const k of [MERGE, CMP]) {
      expect(k.engine).toBe(ENGINE_KO);
      expect(k.next).toBe(NEXT_KO);
      expect(k.pages).toBe(formatPages);
      expect(k.nonPdf).toBe(nonPdfMessage);
    }
    expect(IJ.next).toBe(NEXT_KO);
    expect(MERGE.fileName).toBe(mergedFileName);
    expect(CMP.fileName).toBe(compressedFileName);
    expect(CMP.target).toBe(TARGET_COPY);
    expect(CMP.targetRange).toBe(TARGET_RANGE_MESSAGE);
    expect(IJ.errors).toBe(ERRORS);
    expect(IJ.note).toBe(noteText);
  });
});

describe('PDF 합치기 KO', () => {
  it('errors and fixed strings', () => {
    expect(MERGE.errors).toEqual({
      'not-pdf': 'PDF 파일이 아닙니다. PDF 파일만 합칠 수 있습니다.',
      password: '이 파일은 비밀번호로 보호되어 있습니다.',
      'wrong-password': '비밀번호가 맞지 않습니다.',
      corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
      oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. 파일 수를 줄여 나눠서 합쳐 주세요.',
      unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
      verify: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
    });
    expect(MERGE.preparing).toBe('처리 도구를 준비하는 중입니다(처음 한 번만).');
    expect(MERGE.blockOne).toBe('파일을 하나 더 추가하면 합칠 수 있습니다.');
    expect(MERGE.blockPending).toBe('처리 도구를 불러오지 못해 파일을 확인하지 못했습니다.');
    expect(MERGE.blockInspecting).toBe('파일을 확인하는 중입니다.');
    expect(MERGE.blockError).toBe('문제가 있는 파일을 목록에서 삭제하면 합칠 수 있습니다.');
    expect(MERGE.blockLocked).toBe('비밀번호가 걸린 파일의 비밀번호를 입력하면 합칠 수 있습니다.');
    expect([MERGE.thumbLocked, MERGE.thumbInspecting, MERGE.thumbPending, MERGE.thumbPdf]).toEqual(['잠김', '확인 중', '대기', 'PDF']);
    expect([MERGE.stateLocked, MERGE.stateError]).toEqual(['잠김', '오류']);
    expect(MERGE.ownerNote).toBe('보안 설정(편집 제한)이 해제된 사본이 만들어집니다');
    expect(MERGE.pwState).toBe('이 파일은 비밀번호로 보호되어 있습니다.');
    expect([MERGE.pwLabel, MERGE.pwToggle, MERGE.pwOk, MERGE.pwEmpty]).toEqual(['비밀번호', '비밀번호 보기', '확인', '비밀번호를 입력해 주세요.']);
    expect(MERGE.merging).toBe('합치는 중입니다.');
    expect(MERGE.cancelled).toBe('합치기를 취소했습니다. 파일 목록은 그대로 있습니다.');
    expect(MERGE.noteUnlocked).toBe('합친 파일에는 비밀번호가 걸려 있지 않습니다.');
    expect(MERGE.reset).toBe('처음 상태로 돌아왔습니다.');
  });

  it('functions', () => {
    expect(MERGE.runButton(3)).toBe('PDF 3개 합치기');
    expect(MERGE.moveUp('a.pdf')).toBe('a.pdf 위로 이동');
    expect(MERGE.moveDown('a.pdf')).toBe('a.pdf 아래로 이동');
    expect(MERGE.remove('a.pdf')).toBe('a.pdf 삭제');
    expect(MERGE.pwOkLabel('a.pdf')).toBe('a.pdf 비밀번호 확인');
    expect(MERGE.moved('a.pdf', 4, 2)).toBe('a.pdf: 4개 중 2번째로 옮겼습니다.');
    expect(MERGE.removed('a.pdf', 3)).toBe('a.pdf 파일을 목록에서 뺐습니다. 3개 남았습니다.');
    expect(MERGE.removedBad(2, 3)).toBe('문제 파일 2개를 목록에서 뺐습니다. 3개 남았습니다.');
    expect(MERGE.added(2, 5)).toBe('파일 2개를 추가했습니다. 모두 5개입니다.');
    expect(MERGE.unlocked('a.pdf')).toBe('a.pdf의 잠금을 풀었습니다.');
    expect(MERGE.progress(1, 3)).toBe('합치는 중… (1/3)');
    expect(MERGE.saveName('a_외1건_합침.pdf')).toBe('저장될 이름: a_외1건_합침.pdf');
    expect(MERGE.noteRenamed(2)).toBe('같은 이름의 입력 칸 2개의 이름을 바꿔 모두 입력할 수 있게 했습니다.');
    expect(MERGE.done('3쪽 · 1.0 MB', '')).toBe('합치기를 마쳤습니다. 3쪽 · 1.0 MB.');
    expect(MERGE.done('3쪽 · 1.0 MB', '합친 파일에는 비밀번호가 걸려 있지 않습니다.')).toBe(
      '합치기를 마쳤습니다. 3쪽 · 1.0 MB. 합친 파일에는 비밀번호가 걸려 있지 않습니다.',
    );
  });

  it('limits', () => {
    expect(MERGE.limits.tooMany(50, 2)).toBe('한 번에 최대 50개 파일까지 합칠 수 있어 2개 파일은 추가하지 않았습니다. 나머지는 나눠서 합쳐 주세요.');
    expect(MERGE.limits.tooBig(500 * MB, 'desktop')).toBe('파일 합계가 500 MB를 넘으면 이 기기에서 한 번에 합칠 수 없어 일부 파일을 추가하지 않았습니다. 파일을 나눠서 합쳐 주세요.');
    expect(MERGE.limits.tooBig(150 * MB, 'mobile')).toBe('파일 합계가 150 MB를 넘으면 휴대폰에서 한 번에 합칠 수 없어 일부 파일을 추가하지 않았습니다. 파일을 나눠서 합쳐 주세요.');
    expect(MERGE.limits.softBytes(200 * MB)).toBe('파일 합계가 200 MB를 넘습니다. 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속 합칠까요?');
    expect(MERGE.limits.softPages(1500)).toBe('모두 1,500쪽이 넘습니다. 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속 합칠까요?');
  });
});

describe('PDF 용량 줄이기 KO', () => {
  it('errors and fixed strings', () => {
    expect(CMP.errors).toEqual({
      'not-pdf': 'PDF 파일이 아닙니다. PDF 파일을 골라 주세요.',
      password: '이 파일은 비밀번호로 보호되어 있습니다. 비밀번호를 입력해 주세요.',
      'wrong-password': '비밀번호가 맞지 않습니다.',
      corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
      oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. 더 작은 파일로 시도하거나 PC에서 이용해 주세요.',
      unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
      verify: '결과 파일을 검증하지 못해 원본을 그대로 둡니다. 다른 단계로 다시 시도해 주세요.',
    });
    expect(CMP.phases).toEqual({ normalize: '파일 분석 중…', images: '이미지 줄이는 중…', optimize: '마무리 중…', verify: '마무리하는 중…' });
    expect(CMP.preparing).toBe('처리 도구를 준비하는 중입니다(처음 한 번만).');
    expect(CMP.blockPending).toBe('처리 도구를 불러오지 못해 파일을 확인하지 못했습니다.');
    expect(CMP.blockInspecting).toBe('파일을 확인하는 중입니다.');
    expect(CMP.blockPassword).toBe('비밀번호를 입력하면 줄일 수 있습니다.');
    expect([CMP.againTarget, CMP.againLevel]).toEqual(['다른 용량으로 다시 줄이기', '다른 단계로 다시 줄이기']);
    expect([CMP.thumbPending, CMP.thumbLocked, CMP.thumbInspecting, CMP.thumbPdf]).toEqual(['대기', '잠김', '확인 중', 'PDF']);
    expect(CMP.pwEmpty).toBe('비밀번호를 입력해 주세요.');
    expect(CMP.rasterProgress).toBe('쪽을 이미지로 바꾸는 중…');
    expect(CMP.rasterStatus).toBe('쪽을 이미지로 바꾸는 중입니다.');
    expect(CMP.targetStatus).toBe('목표 용량에 맞추는 중입니다.');
    expect(CMP.levelStatus).toBe('용량을 줄이는 중입니다.');
    expect([CMP.previewOriginal, CMP.previewResult]).toEqual(['원본', '결과']);
    expect(CMP.noteUnlocked).toBe('줄인 파일에는 비밀번호가 걸려 있지 않습니다.');
    expect(CMP.noteOwner).toBe('보안 설정(편집 제한)을 해제한 사본입니다.');
    expect(CMP.keptRaster).toBe('이미지로 바꾸면 오히려 커져서 원본을 그대로 둡니다. 이 파일에는 이 방법이 맞지 않습니다.');
    expect(CMP.keptOptimized).toBe('이미 최적화된 파일입니다. 줄일 수 있는 이미지가 없어 원본을 그대로 둡니다.');
    expect(CMP.keptJpx).toBe('이 파일의 이미지는 JPEG2000 형식이라 아직 줄이지 못합니다.');
    expect(CMP.keptBilevel).toBe('흑백 스캔 이미지는 이미 작게 저장되어 있습니다.');
    expect(CMP.cancelled).toBe('줄이기를 취소했습니다. 파일과 설정은 그대로 있습니다.');
    expect(CMP.reset).toBe('처음 상태로 돌아왔습니다.');
    expect(CMP.backToRecommended).toBe('권장 단계로 돌아왔습니다.');
  });

  it('functions', () => {
    expect(CMP.checking('a.pdf')).toBe('a.pdf 파일을 확인하는 중입니다.');
    expect(CMP.locked('a.pdf')).toBe('a.pdf: 이 파일은 비밀번호로 보호되어 있습니다.');
    expect(CMP.ready('a.pdf', '12쪽')).toBe('a.pdf, 12쪽. 압축 단계나 목표 용량을 고른 뒤 PDF 용량 줄이기를 누르세요.');
    expect(CMP.unlocked('a.pdf', '12쪽')).toBe('a.pdf의 잠금을 풀었습니다. 12쪽.');
    expect(CMP.targetImages('목표 용량에 맞추는 중… (2/5단계)', 3, 9)).toBe('목표 용량에 맞추는 중… (2/5단계) · 이미지 3/9');
    expect(CMP.reduced(42, '12쪽')).toBe('42% 줄었습니다 · 12쪽');
    expect(CMP.saveName('a_압축.pdf')).toBe('저장될 이름: a_압축.pdf');
    expect(CMP.done('10 MB → 2 MB', '80% 줄었습니다 · 3쪽', '')).toBe('용량을 줄였습니다. 10 MB → 2 MB, 80% 줄었습니다 · 3쪽.');
  });

  it('limits', () => {
    expect(CMP.limits.fileBytes(100 * MB, 'desktop')).toBe('이 기기에서는 100 MB까지 줄일 수 있습니다. 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.');
    expect(CMP.limits.fileBytes(50 * MB, 'mobile')).toBe('휴대폰에서는 50 MB까지 줄일 수 있습니다. 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.');
    expect(CMP.limits.rasterPages(500, 'desktop')).toBe(
      '이미지로 변환은 이 기기에서는 500쪽까지 할 수 있습니다. 쪽마다 큰 이미지를 만들어 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.',
    );
    expect(CMP.limits.softRaster(200)).toBe('200쪽이 넘는 파일을 이미지로 바꾸면 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속 줄일까요?');
    expect(CMP.limits.softBytes(40 * MB)).toBe('40 MB가 넘는 파일은 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속 줄일까요?');
    expect(CMP.limits.softPages(1000)).toBe('1,000쪽이 넘는 파일은 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속 줄일까요?');
  });
});

describe('사진 JPG 변환 KO', () => {
  it('fixed strings', () => {
    expect(IJ.canvas).toBe('이 기기에서 사진을 그리지 못했습니다. 다른 앱이나 PC에서 다시 해 주세요.');
    expect(IJ.encoder).toBe('이 형식으로 저장하지 못했습니다. 다른 저장 형식을 골라 다시 해 주세요.');
    expect(IJ.runIdle).toBe('변환하기');
    expect(IJ.hintChecking).toBe('사진을 확인하는 중입니다.');
    expect(IJ.hintSkip).toBe('문제가 있는 사진은 빼고 바꿉니다.');
    expect([IJ.thumbChecking, IJ.thumbPhoto, IJ.stateError, IJ.download]).toEqual(['확인 중', '사진', '오류', '내려받기']);
    expect(IJ.converting).toBe('사진을 바꾸는 중입니다.');
    expect(IJ.allFailed).toBe('사진을 바꾸지 못했습니다. 목록에서 이유를 확인해 주세요.');
    expect(IJ.cancelled).toBe('변환을 멈췄습니다. 사진 목록은 그대로 있습니다.');
    expect(IJ.reset).toBe('처음 상태로 돌아왔습니다.');
  });

  it('functions', () => {
    expect(IJ.notFormat('TIFF')).toBe('TIFF 형식은 아직 바꿀 수 없습니다.');
    expect(IJ.runButton(1200)).toBe('사진 1,200장 변환하기');
    expect(IJ.downloadLabel('a.jpg')).toBe('a.jpg 내려받기');
    expect(IJ.remove('a.png')).toBe('a.png 삭제');
    expect(IJ.removed('a.png', 2)).toBe('a.png 사진을 목록에서 뺐습니다. 2장 남았습니다.');
    expect(IJ.added(2, 5)).toBe('사진 2장을 추가했습니다. 모두 5장입니다.');
    expect(IJ.progress(1, 4)).toBe('바꾸는 중… (1/4)');
    expect(IJ.saveName('a.jpg')).toBe('저장될 이름: a.jpg');
    expect(IJ.headlineMany('JPG', 1200)).toBe('JPG 사진 1,200장이 ZIP 파일로 준비되었습니다');
    expect(IJ.headlineOne('WebP')).toBe('WebP 사진이 준비되었습니다');
    expect(IJ.failedCount(2)).toBe('바꾸지 못한 사진 2장');
    expect(IJ.done('JPG 사진이 준비되었습니다', 'JPG · 1.0 MB')).toBe('JPG 사진이 준비되었습니다. JPG · 1.0 MB.');
  });

  it('limits', () => {
    expect(IJ.limits.tooMany(200, 3)).toBe('한 번에 최대 200장까지 바꿀 수 있어 3장은 추가하지 않았습니다. 나머지는 나눠서 바꿔 주세요.');
    expect(IJ.limits.fileTooBig(100 * MB, 'desktop', 1)).toBe('사진 한 장은 이 기기에서 100 MB까지 넣을 수 있어 1장은 추가하지 않았습니다.');
    expect(IJ.limits.totalTooBig(500 * MB, 'desktop', 1)).toBe('사진 합계가 500 MB를 넘으면 이 기기에서 한 번에 바꿀 수 없어 1장은 추가하지 않았습니다. 나눠서 바꿔 주세요.');
  });
});
