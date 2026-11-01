---
name: jnu-disaster-sim
description: 제주대 캠퍼스 재난 시뮬레이터(three.js 웹앱)를 실행·수정·검증하는 방법. 이 저장소에서 재난을 추가하거나 바꾸고, 캠퍼스 데이터·UI를 고치고, 테스트하고, 커밋할 때 사용한다.
---

# 제주대 캠퍼스 재난 시뮬레이터 작업 스킬

이 저장소는 빌드 단계가 없는 정적 웹앱이다. `index.html`이 `vendor/three/*.js`와 `src/*.js`를 일반 `<script>`로 순서대로 불러오고, 모든 모듈은 전역 스코프를 공유한다. 이 구조를 지키는 것이 이 스킬의 첫 번째 원칙이다.

## 작업 전에 확인할 것

1. `README.md`의 "구조" 절을 읽고 수정할 파일을 정한다.
2. 아래 "모듈 규칙"을 지킬 수 있는지 확인한다. 번들러, 모듈 시스템(import/export), 외부 CDN을 새로 도입하지 않는다. 오프라인에서 `index.html`을 더블클릭해 실행되는 것이 과제 요구사항이다.
3. 실행 플랫폼은 웹 브라우저로 한정한다. Node 스크립트는 개발 보조(서버·테스트·번들)에만 쓴다.

## 모듈 규칙

- 파일은 `src/NN-이름.js` 형식이고 번호 순서대로 로드된다. 뒤 파일은 앞 파일의 전역을 쓸 수 있고, 앞 파일이 뒤 파일의 전역을 쓰는 것은 함수 본문 안(실행 시점)에서만 허용된다.
- 새 파일을 만들면 `index.html`의 `<script src="src/...">` 목록에 번호 순서대로 추가한다. 빠뜨리면 `scripts/bundle.mjs`와 E2E 테스트 모두 실패한다.
- 최상위 이름은 모든 파일에서 유일해야 한다. 같은 이름의 `const`/`function`이 두 파일에 있으면 페이지 전체가 멈춘다. 추가 전 `grep -n "^const 이름\|^function 이름\|^let 이름" src/*.js`로 확인한다.
- 좌표계: x는 동쪽, z는 남쪽(미터), y는 해발 고도. 지면 높이는 `H(x, z)`로 얻는다. 캠퍼스 범위는 대략 x, z ∈ [-850, 850].
- 시간: 시뮬레이션 로직은 `dt`(슬로 모션 반영)와 `S.time`을 쓰고, 카메라·UI는 실제 시간 `rdt`와 `S.real`을 쓴다.

| 파일 | 역할 |
|---|---|
| 00-data | OSM 캠퍼스 데이터 `DATA` (건물 `B`, 구역 `A`, 도로 `R`, 지점 `P`, 고도 `ELEV`) |
| 01-util | 다각형·노이즈·난수 유틸 |
| 02-core | 렌더러, 카메라, 상태 `S`, 시간대, 하늘, 후처리, `later()` 타이머 |
| 03-terrain | 지형 `H()`, 지표 텍스처, `deformCrater`, `markScorch`, `pickGround` |
| 04-buildings | `BLD`(건물), `SEGS`(분할 구역), `damageSeg`, `collapseSeg`, `igniteSeg` |
| 05-vegetation | 수목 `T`, `tipTree`, `igniteTree`, `destroyTree`, 가로등 |
| 06-particles | `emitFlame`, `emitSmoke`, `emitSpark`, `shockwave`, `fireball`, `dustRing` |
| 07-debris | `spawnDebris` 파편 물리 |
| 08-agents | 보행자·차량·소방차, `addThreat`(사람이 피해 달아날 위험 지점) |
| 09-sound | `sfx` 절차적 사운드 |
| 10-environment | 해일 물, 비, 번개, 화산 분연, 바람 |
| 11-disasters | 재난 9종과 `DISASTERS` 등록표, `explosion`, `blast`, `makeFaller` |
| 12-main | UI, 입력, 카메라 추적, 통계, 메인 루프, 로딩 단계 |

## 새 재난 추가 절차

1. `src/11-disasters.js`에 시작 함수 `startXxx(x, z)`를 만든다. 강도는 `S.power`(1~10)에서 읽는다.
2. 지속되는 재난이면 상태 객체와 `updateXxx(dt)`를 만들고 `updateHazards(dt)` 안에서 호출한다. `resetHazards()`에서 상태와 생성한 메시를 반드시 정리한다.
3. 피해는 직접 수치를 바꾸지 말고 기존 함수로 준다.
   - 건물: `damageSeg(seg, amount, dir, cause)` / 범위 탐색은 `segsNear(x, z, r)`와 `segDist(seg, x, z)`
   - 폭발형: `explosion(x, z, R, power, opts)` 하나로 화구·충격파·크레이터·피해·소리가 모두 처리된다
   - 낙하체: `makeFaller({ start, end, dur, mesh, trail, onImpact, target })`, 조준 표시는 `claimTarget(x, z, r)`
   - 사람 대피: `addThreat(x, z, r, strength, ttl)`
4. 사용자에게 보이는 일은 `logEvent(메시지, 'crit'|'warn'|'fire'|'ok')`로 기록하고, 필요하면 `camFocus` 또는 `camFollow`로 카메라를 안내한다.
5. `DISASTERS` 객체에 항목을 추가한다: `name`, `key`(숫자키), `desc`, `radius(P)`(0이면 위치 지정 없음), `run(x, z)`, `info(P)`. 버튼과 단축키는 이 표에서 자동 생성된다.
6. `test/e2e/run.mjs`의 `CASES`에 `{ mode, at, expect }`를 추가한다. `expect`는 시작 시 남기는 로그 문구다.
7. README의 재난 표와 TODO를 갱신한다.

## 실행과 검증

```bash
npm test            # 데이터 검증 (의존성 없음, 1초 이내)
npm start           # http://localhost:8080 로 실행
npm run test:e2e    # 헤드리스 크롬으로 로드·클릭·재난 9종·복구·오류 검사
npm run screenshots # E2E와 같은 흐름으로 docs/screenshots 갱신
npm run bundle      # dist/jnu-disaster-sim.html 단일 파일 생성
```

- E2E는 `npm install` 후 `npx playwright install chromium`이 필요하다. 테스트는 `index.html?test&quality=low`로 열어 `window.__sim`을 통해 상태를 읽는다. `?test`가 없으면 내부 객체는 노출되지 않는다.
- 변경을 마쳤다고 보고하기 전에 최소한 `npm test`와 `npm run test:e2e`가 모두 통과해야 한다. E2E를 돌릴 수 없는 환경이면 `node --check src/*.js`라도 실행하고, 브라우저로 직접 열어 확인하지 못했다고 명시한다.
- 화면 확인이 필요한 변경(이펙트, 레이아웃)은 `npm run screenshots` 결과 이미지를 직접 열어 본다.

## 커밋 규칙

- 할 일 하나를 끝낼 때마다 커밋하고 바로 푸시한다. `TODO.md`의 해당 항목도 같은 커밋에서 체크한다.
- 메시지 형식: `유형: 무엇을 했는지` (한국어, 50자 이내) + 빈 줄 + 본문에 이유와 주요 변경 목록.
  - 유형: `feat`(기능), `fix`(버그), `test`, `docs`, `refactor`, `chore`
- 데이터(`src/00-data.js`)를 바꾸면 출처를 커밋 본문에 적는다. OSM 데이터는 ODbL 고지를 유지한다.

## 자주 하는 실수

- 효과를 `scene.add`로 만들고 `resetHazards`/`dispose`에서 제거하지 않아 "캠퍼스 복구" 후에도 남는 것
- 파티클 개수에 `FX_BUDGET`을 곱하지 않아 저사양 기기에서 프레임이 무너지는 것
- 피해량을 `dt` 없이 매 프레임 더해 화면 주사율에 따라 결과가 달라지는 것
- 건물 데이터 좌표를 위경도로 넣는 것 (미터 좌표여야 함, `DATA.origin` 기준)
