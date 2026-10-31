---
draft: true
title: HSK 원서 사진 규격
query: HSK 사진 규격
blockedBy: 'hsk.or.kr states no photo rule on its public pages; the photo step is inside the logged-in registration flow.'
publishBy: '2026-11-03'
tried:
  - url: https://www.hsk.or.kr/
    result: 'HTTP 200, 67,817 bytes: no 사진 text.'
    date: '2026-10-12'
  - url: https://www.hsk.or.kr/?c1=100&c2=002&c3=002&c4=001
    result: 'HTTP 200 (HSK IBT 인터넷접수): no 사진 text.'
    date: '2026-10-12'
  - url: https://www.hsk.or.kr/?c1=100&c2=001&c3=003&c4=001
    result: 'HTTP 200 (HSK PBT 응시자 가이드): no 사진 text.'
    date: '2026-10-12'
  - url: https://www.hsk.or.kr/?c1=400&c2=003
    result: 'HTTP 200 (FAQ): no 사진 text.'
    date: '2026-10-12'
  - url: https://www.hsk.or.kr/?c1=400&c2=003
    result: 'Chrome: FAQ, 인터넷접수 (c1=100&c2=002&c3=002&c4=001) and 응시자 가이드 (c1=100&c2=002&c3=003&c4=001) contain no 사진 text.'
    date: '2026-10-30'
---
