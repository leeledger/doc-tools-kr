---
title: 전자소송 PDF 용량, 파일 하나 20MB까지
description: 전자소송에 낼 수 있는 파일 형식과 용량(파일 하나 20MB, 모두 합쳐 100M)을 대법원 전자소송포털 안내로 정리했어요.
ogDescription: 전자소송 첨부파일은 하나에 20MB까지, 모두 합쳐 100M 이하예요.
query: 전자소송 pdf 용량
answer: 전자소송에 내는 파일은 하나에 20MB를 넘을 수 없고, 넘으면 여러 파일로 나눠 내되 모두 합쳐 100M 이하여야 해요.
published: '2026-10-02'
updated: '2026-10-02'
category: PDF
topic: 세금·민원
tools: [pdf-compress, pdf-merge]
cta: { href: '/pdf-compress/?target=20', label: 'PDF 20MB 이하로 줄이기' }
related: [pdf-compress, pdf-merge, email-attachment-limit]
sources:
  - url: https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01
    title: 대법원 전자소송포털 — 자주하는질문
    quote: '제출가능한 파일형식 : HWP, HWPX, DOC, DOCX, PDF, TXT, XLS, XLSX, BMP, JPG, JPEG, GIF, TIF, TIFF, PNG (PDF파일로 자동변환, 20MB까지 첨부가능)'
    retrieved: '2026-10-02'
    via: browser
  - url: https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01
    title: 대법원 전자소송포털 — 자주하는질문
    quote: 민사소송 등에서의 전자문서 이용 등에 관한 규칙 제8조 제4항에 따라 원칙적으로 HWP, DOC 등 원본 파일을 직접 제출하여야 하므로, 출력물을 스캔하여 제출하지 않도록 유의하시기 바랍니다.
    retrieved: '2026-10-02'
    via: browser
  - url: https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01
    title: 대법원 전자소송포털 — 자주하는질문
    quote: 스캔한 파일이 JPG, TIFF, GIF, BMP 등의 이미지 파일인 경우에는 PDF변환프로그램을 이용하여 PDF파일로 변환한 후 제출해야 합니다.
    retrieved: '2026-10-02'
    via: browser
  - url: https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01
    title: 대법원 전자소송포털 — 자주하는질문
    quote: 2페이지 이상의 서류를 스캔하여 페이지별로 이미지 파일이 생성된 경우에는 PDF변환프로그램의 PDF병합 기능을 이용하여, 하나의 PDF서류로 변환하신 후 제출해야 합니다.
    retrieved: '2026-10-02'
    via: browser
  - url: https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01
    title: 대법원 전자소송포털 — 자주하는질문
    quote: ※ 파일 하나의 크기는 20MB를 초과할 수 없고, 20MB를 초과하는 경우에는 여러 개의 파일로 분리하여 제출할 수 있으나 첨부파일의 총용량은 100M 이하로 제한됩니다.
    retrieved: '2026-10-02'
    via: browser
  - url: https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01
    title: 대법원 전자소송포털 — 자주하는질문
    quote: '파일형식 : AVI, WMV, MP4, MPG, MPEG, ASF, MP3, WMA, MOV, PPT, PPTX, M4A'
    retrieved: '2026-10-02'
    via: browser
  - url: https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01
    title: 대법원 전자소송포털 — 자주하는질문
    quote: '파일용량 : 100 MB까지 첨부가능'
    retrieved: '2026-10-02'
    via: browser
  - url: https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01
    title: 대법원 전자소송포털 — 자주하는질문
    quote: 위의 파일형식과 다르거나 용량이 큰 파일은 부득이하게 법원에 직접 방문하셔서 제출해야 합니다.
    retrieved: '2026-10-02'
    via: browser
spec:
  - label: 전자소송 첨부 문서 (파일 하나)
    kind: upload
    mb: 20
    format: HWP·DOC·PDF·JPG 등
    source: 1
  - label: 전자소송 첨부파일 (총용량)
    kind: upload
    mb: 100
    source: 5
  - label: 전자소송 동영상·음성 자료
    kind: upload
    mb: 100
    format: MP4·MP3·AVI 등
    fit: false
    source: 7
faq:
  - q: 전자소송 첨부파일은 몇 MB까지 되나요?
    a: 대법원 전자소송포털 안내에 따르면 파일 하나는 20MB를 넘을 수 없어요. 넘으면 여러 파일로 나눠 낼 수 있지만, 첨부파일을 모두 합친 용량은 100M 이하여야 해요.
  - q: 한글(HWP) 파일도 그대로 낼 수 있나요?
    a: 네. HWP, HWPX, DOC, DOCX, PDF, TXT, XLS, XLSX, JPG, PNG 같은 파일을 낼 수 있고, 낸 파일은 PDF로 자동으로 바뀌어요. 원칙적으로 원본 파일을 직접 내야 하니, 출력해서 스캔한 파일로 내지 않도록 안내해요.
  - q: 종이서류는 어떻게 내나요?
    a: 스캐너로 스캔한 뒤 내요. 스캔한 파일이 JPG 같은 사진 파일이면 PDF로 바꿔서 내고, 2페이지 이상이면 하나의 PDF로 합쳐서 내야 해요.
  - q: 동영상이나 녹음 파일은요?
    a: AVI, MP4, MOV, MP3, M4A 같은 형식으로 100MB까지 낼 수 있어요. 형식이 다르거나 더 큰 파일은 법원에 직접 가서 내야 해요.
  - q: 문서딱으로 사진을 PDF로 바꿀 수 있나요?
    a: 아니요. 문서딱은 사진을 PDF로 바꾸지 않아요. 이미 PDF인 여러 파일을 하나로 합치거나, PDF 용량을 줄일 때 쓸 수 있어요.
og: { title: '전자소송 PDF 용량', line: '파일 하나 20MB · 모두 합쳐 100M' }
---

## 낼 수 있는 파일과 용량

대법원 전자소송포털 안내를 표로 모았어요.

| 구분 | 용량 |
|---|---|
| 문서 (PDF로 자동 변환) | 20MB까지 |
| 동영상·음성 | 100MB까지 |

- **문서 형식:** HWP, HWPX, DOC, DOCX, PDF, TXT, XLS, XLSX, BMP, JPG, JPEG, GIF, TIF, TIFF, PNG
- **동영상·음성 형식:** AVI, WMV, MP4, MPG, MPEG, ASF, MP3, WMA, MOV, PPT, PPTX, M4A

- 파일 하나는 20MB를 넘을 수 없어요. 넘으면 여러 파일로 나눠 낼 수 있어요.
- 첨부파일을 모두 합친 용량은 100M 이하로 제한돼요.
- 형식이 다르거나 용량이 큰 동영상·음성 파일은 법원에 직접 가서 내야 해요.

## 원본 파일을 그대로 내요

전자소송포털은 HWP, DOC 같은 원본 파일을 직접 내는 것이 원칙이라고 안내해요. 출력한 종이를 다시 스캔해서 내지 않도록 주의하세요. 낸 파일은 PDF로 자동으로 바뀌어요.

## 종이서류를 스캔해서 낼 때

1. 스캐너(또는 스캔 기능이 있는 복합기)로 스캔해요.
2. 스캔한 파일이 JPG 같은 사진 파일이면 PDF로 바꿔서 내야 해요.
3. 2페이지 이상이면 하나의 PDF로 합쳐서 내야 해요.

스캔한 결과가 페이지마다 따로 된 PDF라면 [PDF 합치기](/pdf-merge/)로 하나로 묶을 수 있어요. 문서딱은 사진(JPG 등)을 PDF로 바꾸지는 않아요.

## 20MB를 넘을 때

- [PDF 용량 줄이기](/pdf-compress/?target=20)에서 목표 용량을 20MB로 두면 그 안에 들어오는 가장 선명한 결과를 찾아요.
- 줄여도 크면 여러 파일로 나눠 내요. 이때도 모두 합쳐 100M 이하여야 해요.
