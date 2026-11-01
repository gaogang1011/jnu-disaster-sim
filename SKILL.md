---
name: jnu-disaster-sim
description: 제주대 재난 대피 시뮬레이터(three.js 웹앱)를 실행·수정·검증하는 방법. 이 저장소에서 재난·대피소·대피 규칙을 추가하거나 바꾸고, 캠퍼스 데이터·UI를 고치고, 테스트하고, 커밋할 때 사용한다.
---

# 제주대 재난 대피 시뮬레이터 작업 스킬

이 앱의 목적은 "재난이 나면 캠퍼스 어디가 위험하고, 사람들이 어디로 어떻게 대피하며, 얼마나 걸리는가"를 보여주는 것이다. 파괴 연출을 늘리는 방향의 변경은 하지 않는다. 공격·무기 성격의 시나리오는 추가하지 않는다.

저장소는 빌드 단계가 없는 정적 웹앱이다. `index.html`이 `vendor/three/*.js`와 `src/*.js`를 일반 `<script>`로 순서대로 불러오고, 모든 모듈은 전역 스코프 하나를 공유한다.

## 작업 전에 확인할 것

1. `README.md`의 "구조" 절과 `docs/DESIGN.md`를 읽고 수정할 파일을 정한다.
2. 번들러, `import`/`export`, 외부 CDN을 새로 도입하지 않는다. `index.html`을 더블클릭해 오프라인으로 실행되는 것이 요구사항이다.
3. 실행 플랫폼은 웹 브라우저다. Node 스크립트는 개발 보조(서버·테스트·번들)에만 쓴다.

## 모듈 규칙

- 파일은 `src/NN-이름.js`이고 파일명 순서대로 로드된다. 뒤 파일은 앞 파일의 전역을 쓸 수 있다. 앞 파일이 뒤 파일의 전역을 쓰는 것은 함수 본문 안(실행 시점)에서만 허용된다.
- 새 파일은 `index.html`의 `<script src="src/...">` 목록에 파일명 순서대로 넣는다. `test/structure.test.mjs`가 순서를 검사한다.
- **최상위 이름(`function`·`const`·`let`·`class`)은 모든 파일에서 유일해야 한다.** 같은 이름의 함수가 뒤 파일에 있으면 앞 파일 함수를 조용히 덮어쓴다. 실제로 대피 모듈의 `nearestFire`가 소방차 함수를 덮어써 화재 때 메인 루프가 멈춘 적이 있다. `npm test`의 구조 테스트가 이것을 잡는다.
- 좌표: x는 동쪽, z는 남쪽(미터), y는 해발 고도. 지면 높이는 `H(x, z)`. 북쪽(z 음수)이 바다 쪽 저지대다.
- 시간: 시뮬레이션은 `dt`·`S.time`(슬로 모션 반영), 카메라·UI는 `rdt`·`S.real`. 대피 지표는 화면 시간에 `EV_K`(10)를 곱한 실제 시간으로 표시한다.
- `src/00-guides.js`, `src/02-route.js`는 브라우저 객체를 쓰지 않는다. Node 테스트가 직접 불러오므로 `THREE`, `document`, `scene`을 넣지 않는다.

| 파일 | 역할 |
|---|---|
| 00-data | OSM 캠퍼스 데이터 `DATA` (건물 `B`, 구역 `A`, 도로 `R`, 지점 `P`, 고도 `ELEV`) |
| 00-guides | 대피소 `SHELTERS`, 행동요령 `GUIDES`·출처 `GUIDE_SOURCES`, `typhoonClass()` |
| 01-util | 다각형·노이즈·난수·`MinHeap` |
| 02-core | 렌더러, 카메라, 상태 `S`, 시간대, 하늘, 후처리, `later()` |
| 02-route | 보행 그래프 `buildWalkGraph`, 다중 출발 다익스트라 `routeToShelters`, `entryNode` |
| 03-terrain | 지형 `H()`, 지표 텍스처, `classAt()`, 크레이터·그을림, `pickGround` |
| 04-buildings | `BLD`·`SEGS`, `damageSeg(seg, 양, 방향, 원인)`, 위험 등급 `segRisk`, `buildingInfo`, `igniteSeg` |
| 05-vegetation | 수목 `T`, `tipTree`, `igniteTree`, 산불 확산, 가로등 |
| 06-particles | 불꽃·연기 파티클, `shockwave`, `fireball`, `dustRing` |
| 07-debris | `spawnDebris` |
| 08-agents | 차량·소방차, `addThreat`(차량이 피하는 위험 지점) |
| 09-sound | `sfx` 절차적 사운드 |
| 10-environment | 물(`FLOOD`, 물 셰이더), 비, 번개, 화산 분연 |
| 11-evacuation | 대피자 `A`, `EVAC`, `evacBegin(id)`, 경로 비용, 대피소 개폐, 지표 `evacMetrics()` |
| 12-disasters | 재난 6종과 등록표 `DISASTERS` (각 `run`이 자동으로 `evacBegin` 호출) |
| 13-main | 패널(시나리오·대피 현황·대피소·행동요령·위험 평가·실행 기록), 입력, 카메라, 메인 루프 |

## 새 재난 추가 절차

1. `src/00-guides.js`의 `GUIDES`에 행동요령(3~5줄)과 출처 키를 추가한다. 출처는 공공기관 자료를 쓰고 `GUIDE_SOURCES`에 URL을 넣는다.
2. 대피 방식을 정한다: `open`(넓은 옥외), `high`(고지대), `indoor`(튼튼한 실내). 새 방식이면 `SHELTERS`에 대피소를 3곳 이상 추가한다. 옥외 대피소는 건물에서 4m 넘게 떨어진 캠퍼스 안 빈 땅이어야 한다(데이터 테스트가 검사).
3. `src/12-disasters.js`에 `startXxx(x, z)`를 만든다. 강도는 `S.power`(1~10)에서 읽고, 실제 단위로 바꾸는 함수(예: `quakeMagnitude(P)`)를 따로 둔다. 시작하지 못했으면 `false`를 돌려준다.
4. 지속되는 재난이면 `updateXxx(dt)`를 `updateHazards(dt)`에서 호출하고, `resetHazards()`에서 상태와 메시를 정리한다.
5. 피해는 `damageSeg(seg, amount, dir, cause)`로만 준다. `cause`는 `CAUSE_NAMES`에 있는 키를 쓰거나 새로 추가한다. 위험 등급과 색은 자동으로 바뀐다. 건물을 무너뜨리는 연출은 넣지 않는다.
6. 대피에 영향을 주는 위험(물·불·낙하물)은 `computeEdgeCosts()`와 `updateShelterStatus()`에 반영한다. 통행 불가는 `Infinity`.
7. `DISASTERS`에 항목을 넣는다: `name`, `key`, `guide`, `shelter`, `desc`, `radius(P)`(0이면 위치 지정 없음), `run(x, z)`, `info(P)`(실제 단위). 버튼·단축키·행동요령 카드·대피소 목록이 자동으로 따라온다.
8. `test/e2e/run.mjs`의 `CASES`에 `{ mode, at, expect, kind }`를 추가하고, 필요하면 `PRESETS`(13-main)에 시나리오를 넣는다.
9. README의 재난 표, `docs/DESIGN.md`, `TODO.md`를 갱신한다.

## 대피 모델을 고칠 때

- 경로 탐색은 대피소 쪽에서 한 번만 도는 다익스트라다. 사람마다 탐색하지 않는다. 사람은 `route.next`를 따라가기만 한다.
- 재탐색 주기는 `EV_REROUTE`(1.5초). 매 프레임 탐색하지 않는다.
- 이동 루프에는 반복 상한(64)이 있다. 지우지 않는다.
- 지표 정의(완료율, 고립, 위험 노출, 시간 환산)를 바꾸면 README "결과 지표" 절도 함께 고친다.

## 실행과 검증

```bash
npm test             # 데이터·경로·구조 테스트 (의존성 없음, 1초 이내)
npm start            # http://localhost:8080
npm run test:e2e     # 헤드리스 크롬: 로드·클릭·재난 6종·대피소 끄기·시나리오·기록표·초기화·오류
npm run screenshots  # 같은 흐름으로 docs/screenshots 갱신
npm run bundle       # dist/jnu-disaster-sim.html 단일 파일
```

- E2E는 `npm install`과 `npx playwright install chromium`이 필요하다. 테스트는 `index.html?test&quality=low`로 열고 `window.__sim`으로 상태를 읽는다. `?test`가 없으면 내부 객체는 노출되지 않는다.
- 완료를 보고하기 전에 `npm test`와 `npm run test:e2e`가 통과해야 한다. E2E를 돌릴 수 없으면 `node --check src/*.js`라도 실행하고, 브라우저 확인을 못 했다고 밝힌다.
- 페이지 오류는 테스트 마지막에만 모아 보면 원인을 놓친다. 멈춘 것처럼 보이면 `pageerror`를 즉시 출력해 확인한다.
- 화면이 바뀌는 변경은 `npm run screenshots` 결과를 직접 열어 본다.

## 커밋 규칙

- 할 일 하나를 끝낼 때마다 커밋하고 바로 푸시한다. `TODO.md`의 해당 항목을 같은 커밋에서 체크한다.
- 메시지: `유형: 무엇을 했는지` (한국어 한 줄) + 빈 줄 + 이유와 주요 변경 목록, 확인한 결과.
  - 유형: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`
- 데이터나 행동요령을 바꾸면 출처를 본문에 적는다. OSM 데이터의 ODbL 고지를 유지한다.

## 자주 하는 실수

- 파일 사이 최상위 이름 충돌 (위 "모듈 규칙" 참고)
- `scene.add`로 만든 효과를 `resetHazards`/`resetEvacuation`에서 지우지 않아 초기화 뒤에도 남는 것
- 파티클 개수에 `FX_BUDGET`을 곱하지 않아 저사양 기기에서 프레임이 무너지는 것
- 피해량을 `dt` 없이 더해 화면 주사율에 따라 결과가 달라지는 것
- 위험을 시각 효과로만 넣고 `computeEdgeCosts`에 반영하지 않아 사람들이 불·물 속을 지나가는 것
- 좌표를 위경도로 넣는 것 (`DATA.origin` 기준 미터 좌표여야 함)
