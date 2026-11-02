# graphRAG-codex · 문서 그래프 탐색

한국어 예산 PDF의 정보구조와 전체 연결망, 질문별 조회 경로를 탐색하는 프로토타입입니다.

전체 연결망: http://127.0.0.1:8317/network.html

질문별 단계 보기: http://127.0.0.1:8317/graph-explorer.html

## 실행 환경

정적 HTML/CSS/JavaScript이며 패키지 설치나 외부 CDN이 필요 없다. 앱용 패키지 매니저는 아직 구성하지 않았다. 향후 패키지를 추가하면 pnpm을 사용한다. 프론트엔드 고정 포트는 8317이며 별도 백엔드·DB 서버는 실행하지 않는다. 기존 실행 서버는 `.logs/graph-web.json`에서 PID·주소·로그 경로를 확인한다. 다른 프로젝트의 프로세스를 종료하지 않는다.

서버가 중단된 경우 번들 Python 또는 사용 가능한 Python으로 아래 명령을 실행한다. 먼저 8317 포트의 사용 여부를 확인한다.

```powershell
python -m http.server 8317 --bind 127.0.0.1 --directory output
```

## 데이터와 화면

- `output/knowledge-graph.json`: 문서 구조 기반 추출 초안, 269개 노드·345개 관계.
- `output/network.html`, `network.css`, `network.js`: 전체 노드 연결망. 로컬 서버에서 연다.
- `output/graph-explorer.html`: 기존 질문 단계별 부분 그래프.
- `output/extraction-notes.md`: 추출 범위·기준·검증·제한 사항.

전체 연결망은 현재 추출 데이터 전체를 뜻한다. PDF의 인력·기관임무 등 아직 추출하지 않은 내용과 제안 단계의 의미 분류는 포함하지 않는다. 기본 배치는 모든 노드·관계를 표시하며, 낮은 배율에서는 중요 이름을 우선 표시한다. 확대하거나 ‘모든 이름’을 선택하면 상세 이름을 볼 수 있다. 점의 크기는 정보 유형을 구별하며 예산 규모를 뜻하지 않는다.

예시 질문을 고르면 전체 그래프 안에서 조회 노드·관계가 단계별로 강조된다. 이 경로는 JSON의 실제 관계를 조회한 시연이며 Neo4j나 LLM의 실행 추적이 아니다.

## 검증

`node --check output/network.js` 및 `tests/check-network.cjs`의 Playwright smoke check로 전체 개수, 검색, 유형·주변 필터, 질문 4개 경로, 모바일 가로 넘침을 검사했다. 테스트에는 번들 Node의 Playwright와 설치된 Edge를 사용한다. 현재 package.json/harness가 없어 pnpm test와 pnpm harness:check는 적용하지 않는다.


## 원본과 재추출

샘플 데이터의 원문은 `01-미래청년기획관.pdf`입니다. 원본 PDF는 저장소에 포함하지 않습니다. 상세표 PDF 5~14쪽을 대상으로 26개 세부항목과 산출내역 107개를 추출했습니다. 문서 구조 기반 초안이며 모든 페이지의 최종 시각 검수본은 아닙니다.

원본 PDF를 별도로 준비한 뒤 저장소 루트에서 실행합니다. 다른 형식의 PDF에 적용할 수 있는 범용 추출기는 아닙니다.

```sh
python -m pip install -r requirements.txt
python extract_graph.py --pdf "경로/01-미래청년기획관.pdf"
python tests/check_graph.py
node --check output/network.js
```

또는 `python extract_graph.py --text-json 경로/extracted.json`으로 페이지별 텍스트를 사용합니다. 입력은 `[{"page": 1, "text": "..."}, ...]` 형태입니다. 재추출은 `knowledge-graph.json`과 `projects.csv`를 갱신합니다. 전체 연결망은 JSON을 직접 읽지만, 계층 Markdown과 데이터 내장형 단계별 HTML은 별도로 갱신해야 합니다.

브라우저 smoke check는 서버 실행 후 `node tests/check-network.cjs`로 실행합니다. Node 환경에 Playwright 패키지와 Edge가 필요합니다(예: `npm install --no-save playwright`). 캡처는 Git에서 제외한 `tmp/`에 저장합니다. 개발 당시에는 Codex 번들 Node/Python/Playwright와 설치된 Edge를 사용했습니다.

## 논의와 미구현 사항

- [추출·파일 분석·사용자 개입·GraphRAG 설계](docs/pipeline.md)
- [문서 분석과 모델 추출 프롬프트](docs/prompts.md)

현재 예산 기록도 노드로 표시합니다. 이후 논의한 방향은 조직·사업 관계를 그래프로, 금액·연도별 예산·지출 내역을 표로 관리하고 사업 ID로 연결하는 방식입니다. 아직 데이터와 화면을 변환하지 않았습니다.

Neo4j 적재, 임베딩 검색, 자유 질문 LLM, Together.ai 호출, 자동 기준 추천은 미구현입니다. Together.ai 이용은 클라우드 추론이며 로컬 배포와 실행 환경이 다릅니다. 현재 예시 질문 경로는 실제 JSON 관계를 조회한 시연입니다.
