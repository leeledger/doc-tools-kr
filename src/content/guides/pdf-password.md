---
title: PDF 암호 해제·설정, 폰·PC에서 하는 법
description: 비밀번호를 아는 PDF의 암호를 풀어 저장하는 법과 내 PDF에 열 때 필요한 비밀번호를 거는 법을 정리했어요. 설치 없이 무료예요.
ogDescription: 아는 비밀번호로 PDF 암호를 풀고, 내 PDF에는 비밀번호를 걸어요.
query: pdf 암호 해제
answer: PDF 암호 해제·설정에서 암호 풀기나 암호 걸기를 고르고 파일을 연 뒤 비밀번호를 입력하면 새 PDF로 저장돼요.
published: '2026-10-06'
updated: '2026-10-06'
category: PDF
topic: PDF·메일
tools: [pdf-password]
cta: { href: '/pdf-password/', label: 'PDF 암호 해제·설정' }
related: [pdf-merge, pdf-compress, yearend-tax-pdf]
sources:
  - url: https://qpdf.readthedocs.io/en/stable/encryption.html
    title: qpdf 설명서 — PDF Encryption
    quote: 256-bit encryption always uses AES.
    retrieved: '2026-10-06'
toolFacts:
  - ref: pdf-password.maxFileMb.desktop
    value: 200
  - ref: pdf-password.maxFileMb.mobile
    value: 50
  - ref: pdf-password.passwordMin
    value: 4
  - ref: pdf-password.passwordMax
    value: 64
faq:
  - q: 비밀번호를 잊어버렸어요.
    a: 문서딱으로는 풀 수 없어요. 파일을 보낸 곳에서 안내한 비밀번호를 확인하거나 파일을 다시 받으세요. 비밀번호를 맞혀 보거나 우회하지 않아요.
  - q: 정부24·홈택스에서 받은 PDF도 풀 수 있나요?
    a: 파일을 받을 때 안내받은 비밀번호를 알면 풀 수 있어요. 비밀번호가 무엇인지는 파일을 보낸 곳의 안내를 확인해 주세요.
  - q: 암호를 건 PDF는 어디서 열리나요?
    a: AES-256 방식으로 걸어서, PDF를 여는 대부분의 프로그램과 휴대폰 앱에서 비밀번호를 넣으면 열려요.
  - q: 전자서명이 들어간 증명서도 되나요?
    a: 암호를 풀거나 걸어 새로 저장하면 전자서명이 더 이상 유효하지 않아요. 발급받은 증명서를 제출할 때는 원본을 내세요.
og: { title: 'PDF 암호 해제·설정', line: '아는 비밀번호로 풀고, 새로 걸고 — 무료' }
---

## 암호 풀기

1. [PDF 암호 해제·설정](/pdf-password/)을 열고 할 일에서 「암호 풀기」를 골라요.
2. 「PDF 파일 선택」으로 파일을 골라요.
3. 열 때 쓰는 비밀번호를 입력하고 「암호 풀기」를 누른 뒤 「내려받기」로 저장해요. 저장한 파일은 비밀번호 없이 열려요.

열 때 비밀번호를 묻지 않는 파일은 풀 필요가 없어서 그대로 두어요.

## 암호 걸기

1. 할 일에서 「암호 걸기」를 고르고 파일을 골라요.
2. 새 비밀번호를 두 번 입력해요. 4자에서 64자까지 정할 수 있고 한글도 쓸 수 있어요.
3. 「암호 걸기」를 누른 뒤 「내려받기」로 저장해요.

내려받기 전에 비밀번호 없이는 열리지 않는지 확인해요. 건 비밀번호를 잊으면 문서딱으로도 열 수 없으니 따로 적어 두세요.

## 처리할 수 있는 파일 크기

| 기기 | 파일 크기 |
|---|---|
| PC | 200 MB까지 |
| 휴대폰 | 50 MB까지 |

## 암호를 푼 다음에

암호를 푼 파일 여러 개를 하나로 묶으려면 [PDF 합치기](/pdf-merge/)를, 용량이 크면 [PDF 용량 줄이기](/pdf-compress/)를 쓰세요.
