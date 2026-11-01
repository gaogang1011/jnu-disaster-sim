const SHELTERS = [
  { id: 'stadium', name: '대운동장', x: -236, z: -50, r: 42, kinds: ['open'] },
  { id: 'lawn', name: '중앙 잔디광장', x: -15, z: -204, r: 32, kinds: ['open'] },
  { id: 'gatepark', name: '정문 주차장', x: 24, z: -496, r: 32, kinds: ['open'] },
  { id: 'eastfield', name: '동쪽 운동장', x: 448, z: 156, r: 34, kinds: ['open', 'high'] },
  { id: 'golf', name: '골프 연습장', x: 170, z: 391, r: 34, kinds: ['open', 'high'] },
  { id: 'dormplaza', name: '생활관 광장', x: -380, z: 470, r: 22, kinds: ['high'] },
  { id: 'dlibpark', name: '디지털도서관 주차장', x: -215, z: 339, r: 22, kinds: ['high'] },
  { id: 'clib', name: '중앙도서관', building: '중앙도서관', kinds: ['indoor'] },
  { id: 'union', name: '학생회관', building: '학생회관', kinds: ['indoor'] },
  { id: 'gym', name: '체육관', building: '체육관', kinds: ['indoor'] },
  { id: 'main', name: '본관', building: '본관', kinds: ['indoor'] },
  { id: 'aramuse', name: '아라뮤즈홀', building: '아라뮤즈홀', kinds: ['indoor'] },
  { id: 'dlib', name: '디지털도서관', building: '디지털도서관', kinds: ['indoor'] },
  { id: 'eng4', name: '공과대학 4호관', building: '공과대학 4호관', kinds: ['indoor'] },
  { id: 'med', name: '의과대학', building: '의과대학', kinds: ['indoor'] }
];

const SHELTER_KIND_NAME = { open: '넓은 옥외 공간', high: '고지대', indoor: '튼튼한 실내' };

const GUIDE_SOURCES = {
  mois: { name: '행정안전부 국민행동요령 (국민재난안전포털)', url: 'https://www.safekorea.go.kr/' },
  quake: { name: '서울안전누리 지진대피 요령 (행정안전부 제공)', url: 'https://news.seoul.go.kr/safe/SeoulEqk/html/home/community/prevent.jsp' },
  kwater: { name: 'K-water 국민행동요령', url: 'https://www.kwater.or.kr/safety/sub03/natu02Page.do?s_mid=1942' },
  tsunami: { name: '행정안전부 지진해일 행동요령 보도', url: 'https://www.koreatimenews.com/news/article.html?no=869994' },
  volcano: { name: '국민안전24 화산폭발 시 국민행동요령', url: 'https://www.safekorea.go.kr/safekorea-kor/em/emergency/emergency_er5.html' },
  typhoon: { name: '기상청 태풍 강도 분류', url: 'https://www.weather.go.kr/wnuri_help/html/typhoon/report.jsp?menu=1' }
};

const GUIDES = {
  quake: {
    title: '지진이 나면',
    steps: [
      '흔들리는 동안에는 책상 아래로 들어가 책상 다리를 잡고 몸을 보호합니다.',
      '흔들림이 멈추면 계단으로 건물 밖으로 나갑니다. 엘리베이터는 쓰지 않습니다.',
      '가방이나 손으로 머리를 보호하고 건물과 거리를 두며 이동합니다.',
      '운동장이나 공원처럼 넓은 곳으로 대피합니다. 차량은 이용하지 않습니다.',
      '대피 후에는 재난방송과 안내에 따라 행동합니다.'
    ],
    sources: ['quake', 'kwater']
  },
  tsunami: {
    title: '지진해일 특보가 나면',
    steps: [
      '해안에서 지진을 느끼거나 특보가 발령되면 즉시 해안과 하천에서 멀리 벗어나 높은 곳으로 대피합니다.',
      '피할 시간이 없으면 철근 콘크리트 3층 이상 건물이나 해발 10m 이상 긴급대피장소로 갑니다.',
      '파도는 5~10분 간격으로 계속 밀려오므로 특보가 해제될 때까지 돌아가지 않습니다.'
    ],
    sources: ['tsunami', 'kwater']
  },
  rain: {
    title: '집중호우로 침수가 시작되면',
    steps: [
      '지하 공간과 저지대에서 벗어나 높은 곳으로 이동합니다.',
      '물이 찬 도로를 걷거나 차량으로 지나가지 않습니다.',
      '하천, 배수구, 맨홀 근처에 가까이 가지 않습니다.',
      '감전 위험이 있는 가로등, 신호등, 전기 설비에 접근하지 않습니다.'
    ],
    sources: ['mois']
  },
  typhoon: {
    title: '태풍이 오면',
    steps: [
      '외출을 자제하고 튼튼한 건물 안에 머뭅니다.',
      '창문에서 떨어져 있고, 유리창이 깨질 위험에 대비합니다.',
      '간판, 가로수, 공사장 자재 등 바람에 날리거나 넘어질 수 있는 물건 근처를 피합니다.',
      '하천과 해안에 가까이 가지 않습니다.'
    ],
    sources: ['mois', 'typhoon']
  },
  fire: {
    title: '화재가 나면',
    steps: [
      '"불이야"를 외쳐 주변에 알리고 119에 신고합니다.',
      '연기가 있으면 젖은 수건으로 코와 입을 막고 낮은 자세로 이동합니다.',
      '엘리베이터 대신 계단으로 대피합니다.',
      '산불은 바람이 불어 가는 쪽을 피해 불길에서 먼 넓은 곳으로 이동합니다.'
    ],
    sources: ['mois']
  },
  volcano: {
    title: '화산이 분화하면',
    steps: [
      '땅울림, 연기, 냄새 등 이상 현상을 알아차리면 즉시 안전한 곳으로 대피합니다.',
      '화산가스는 공기보다 무거워 낮은 곳에 쌓이므로 좁고 낮은 지역을 피합니다.',
      '헬멧과 고글을 쓰고 마스크나 젖은 수건으로 입을 막습니다.',
      '화산재가 떨어지는 동안에는 가급적 실내에 머뭅니다.'
    ],
    sources: ['volcano']
  }
};

const TYPHOON_CLASS = [
  { min: 54, name: '초강력' },
  { min: 44, name: '매우 강' },
  { min: 33, name: '강' },
  { min: 25, name: '중' },
  { min: 0, name: '약' }
];
function typhoonClass(ms) { return TYPHOON_CLASS.find(c => ms >= c.min).name; }
