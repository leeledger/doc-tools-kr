---
draft: true
title: 토익 사진 규격
query: 토익 사진 규격
blockedBy: The TOEIC photo spec is shown only inside the logged-in application flow; no public YBM page states pixels, KB or format for the application photo.
tried:
  - url: https://exam.toeic.co.kr/
    result: 'HTTP 200, 69,751 bytes: menus and schedules; no photo spec.'
    date: '2026-10-02'
  - url: https://exam.toeic.co.kr/receipt/receiptStep1.php
    result: 'HTTP 200, 56,025 bytes: exam dates and fees; the next step (receiptStep2.php) redirects back to step 1 without a login.'
    date: '2026-10-02'
  - url: https://exam.toeic.co.kr/customer/csFaq.php?currentPage=3
    result: 'HTTP 200 (pages 1-7 of the FAQ read): the only photo answer is how to change a past photo by email ("변경할 사진 파일(JPG 또는 JPEG)"); no size or KB.'
    date: '2026-10-02'
  - url: https://exam.toeic.co.kr/common/template/viewContents.php?contentsCode=36
    result: 'HTTP 200, 38,999 bytes (수험자가이드): ID rules only; no application photo spec.'
    date: '2026-10-02'
---
