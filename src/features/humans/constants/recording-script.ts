// recording-script.ts — Per-language phonetic-coverage scripts (~2 min read) for voice cloning.

export interface RecordingScriptOption {
  code: string;   // Locale code (independent of SUPPORTED_LANGUAGES)
  label: string;  // English display label for dropdown
  script: string; // Long-form script for the user to read aloud
}

export const RECORDING_SCRIPTS: ReadonlyArray<RecordingScriptOption> = [
  {
    code: 'en_US',
    label: 'English',
    script: `The rapid development of artificial intelligence has opened new horizons in many different fields, from healthcare to entertainment. Machine learning algorithms, supported by massive datasets, are now capable of performing complex tasks previously thought to be the domain of human intelligence. This includes natural language processing, computer vision, and even creative activities such as composing music and creating art.

One of the most fascinating applications of AI is in the field of speech synthesis and transcription. Imagine a world where historical figures can speak to us in their own voices, or where personalized audio content can be created instantly for each individual. While the technology is still evolving, the potential of these innovations is enormous, promising to revolutionize how we interact with digital information and with each other.

However, great power comes with great responsibility. The ethical implications of AI, particularly in areas like deepfakes and data privacy, demand careful consideration. Developers and users need to collaborate to establish guidelines and safeguards to ensure that these powerful tools are used for the benefit of society, fostering innovation while protecting individual rights and social values. The road ahead is fraught with both exciting possibilities and significant challenges, requiring a thoughtful and collaborative approach from everyone.`,
  },
  {
    code: 'vi_VN',
    label: 'Vietnamese',
    script: `Chào bạn, hôm nay chúng ta hãy cùng khám phá vẻ đẹp tiềm ẩn của ngôn ngữ và văn hóa Việt Nam. Từ những câu ca dao, tục ngữ thấm đượm tình người, đến những áng thơ văn bất hủ đã đi vào lòng bao thế hệ, tiếng Việt luôn mang trong mình một sự quyến rũ đặc biệt. Nó không chỉ là phương tiện giao tiếp, mà còn là linh hồn, là bản sắc của dân tộc.

Hãy thử tưởng tượng một buổi sáng tinh mơ, bạn thức dậy giữa không gian yên bình của một làng quê Việt Nam. Tiếng gà gáy vang vọng từ xa, tiếng chim hót líu lo trên cành cây, và mùi hương của đất trời sau cơn mưa đêm. Tất cả hòa quyện tạo nên một bức tranh thanh bình, đánh thức mọi giác quan. Rồi bạn nhâm nhi tách trà nóng, lắng nghe những câu chuyện đời thường từ những người hàng xóm thân thiện. Những khoảnh khắc giản dị ấy lại mang đến niềm hạnh phúc khó tả.

Và khi nhắc đến ẩm thực, làm sao có thể bỏ qua những món ăn truyền thống đã làm nên tên tuổi của Việt Nam trên bản đồ thế giới? Từ phở nóng hổi, bún chả đậm đà, đến nem rán giòn rụm hay bánh mì kẹp thơm lừng. Mỗi món ăn không chỉ là sự kết hợp tinh tế của hương vị, mà còn chứa đựng cả một câu chuyện về văn hóa, về sự khéo léo của người Việt.

Cuộc sống đôi khi hối hả, nhưng những giá trị văn hóa, những nét đẹp truyền thống vẫn luôn hiện hữu, nhắc nhở chúng ta về cội nguồn. Dù bạn ở đâu, làm gì, tiếng Việt vẫn là sợi dây vô hình kết nối những trái tim con người Việt Nam lại với nhau. Hãy trân trọng và gìn giữ nó, như một báu vật vô giá mà cha ông đã để lại.`,
  },
  {
    code: 'ja_JP',
    label: 'Japanese',
    script: `皆さん、こんにちは。今日は、日本の豊かな文化と美しい自然について少しお話ししたいと思います。古くから伝わる伝統芸能、例えば歌舞伎や能、そして繊細な美意識が息づく茶道や華道は、世界中の人々を魅了し続けています。また、四季折々の風景は、日本の大きな魅力の一つです。春には桜が咲き乱れ、夏には緑豊かな山々が涼しさを運び、秋には紅葉が山々を彩り、冬には雪景色が幻想的な世界を作り出します。

日本の食文化もまた、非常に多様で奥深いものです。寿司や刺身といった伝統的な料理はもちろんのこと、ラーメン、うどん、そばといった庶民的な料理も、それぞれに独自の歴史と進化を遂げてきました。地域ごとに異なる食材や調理法があり、旅の楽しみの一つとなっています。

現代の日本は、伝統と革新が共存するユニークな社会です。最先端のテクノロジーが日常生活に溶け込み、同時に古き良き習慣や精神が大切にされています。このバランスが、日本を特別な場所にしているのかもしれません。

私たちは、この素晴らしい文化と自然を未来へと繋いでいく責任があります。そして、世界中の人々と分かち合い、相互理解を深めることで、より豊かな未来を築いていけることでしょう。この短いお話が、皆さんの日本への興味を少しでも深めるきっかけになれば幸いです。`,
  },
  {
    code: 'ko_KR',
    label: 'Korean',
    script: `안녕하세요, 오늘은 한국의 아름다운 문화와 역동적인 사회에 대해 이야기해보고자 합니다. 한국은 오랜 역사와 전통을 자랑하며, 그 속에서 독특하고 매력적인 문화를 꽃피웠습니다. 한글이라는 과학적인 문자는 물론, 판소리, 탈춤과 같은 전통 예술, 그리고 한복과 같은 아름다운 의상은 한국 문화의 깊이를 보여줍니다.

한국어는 그 자체로 매우 표현력이 풍부한 언어입니다. 존댓말과 반말의 사용, 다양한 어미 변화를 통해 화자와 청자 간의 관계와 상황에 따른 미묘한 감정을 전달할 수 있습니다. 이러한 언어적 특성은 한국 드라마나 영화에서 인물들의 감정선을 더욱 풍부하게 만드는 요소가 되기도 합니다.

또한, 한국의 음식 문화는 전 세계적으로 큰 사랑을 받고 있습니다. 김치, 불고기, 비빔밥 등 건강하고 맛있는 한식은 단순한 음식을 넘어, 한국인의 정과 지혜가 담긴 문화유산입니다. 매운맛, 짠맛, 단맛, 신맛이 조화롭게 어우러진 한식은 먹는 이에게 깊은 만족감을 선사합니다.

현대의 한국은 K-팝, K-드라마와 같은 한류 콘텐츠를 통해 전 세계 젊은이들에게 영감을 주고 있습니다. 전통을 소중히 여기면서도 끊임없이 새로운 것을 창조해내는 한국의 역동성은 많은 이들에게 놀라움을 안겨줍니다.

이처럼 한국은 과거와 현재가 공존하며 끊임없이 발전하는 매력적인 나라입니다. 오늘 제가 드린 이야기가 여러분의 한국에 대한 이해를 넓히는 데 조금이나마 도움이 되었기를 바랍니다.`,
  },
  {
    code: 'zh_CN',
    label: 'Chinese (Simplified)',
    script: `大家好，今天我想和大家分享一些关于中国悠久历史和灿烂文化的故事。中国拥有五千年的文明史，这片土地上诞生了无数的智慧结晶和艺术瑰宝。从宏伟的长城到精美的故宫，从深邃的儒家思想到达观的道家哲学，无一不展现着中华民族的独特魅力和深厚底蕴。

中国的语言，特别是普通话，其声调和语气的变化非常丰富，能够表达出细腻的情感和多样的含义。学习中文不仅仅是掌握一门语言，更是打开了一扇了解中国文化、历史和人民的窗户。

此外，中国的美食文化也是世界闻名的。八大菜系各具特色，无论是川菜的麻辣鲜香，粤菜的清淡精致，还是鲁菜的醇厚浓郁，都能让品尝者流连忘返。每一道菜肴背后，都蕴含着独特的烹饪技艺和地域风情。

在现代社会，中国在科技创新和经济发展方面取得了举世瞩目的成就。然而，在快速发展的同时，中国人民依然珍视传统价值观，努力在传统与现代之间寻求平衡。这种对历史的尊重和对未来的憧憬，共同构成了当代中国的独特面貌。

希望通过今天的分享，能让大家对中国有更深入的了解，也期待未来能有更多机会，与大家一起探索这个充满活力和魅力的国度。`,
  },
  {
    code: 'zh_TW',
    label: 'Chinese (Traditional)',
    script: `大家好，今天很開心能和大家分享一些關於臺灣這塊美麗土地的故事。臺灣不僅擁有豐富的自然景觀，從壯麗的山脈到迷人的海岸線，更是一個充滿人情味和獨特文化的地方。我們有著多元的族群融合，讓這片土地上的生活充滿了各種色彩和活力。

臺灣的語言，特別是國語（Mandarin），在發音和語氣上帶有其獨特的溫和與親切感。學習國語不只是一種溝通方式，更是深入了解臺灣社會、歷史和人民情感的橋樑。許多人透過臺灣的戲劇、音樂和電影，開始對這片土地產生興趣，進而學習我們的語言。

當然，提到臺灣，絕對不能錯過我們引以為傲的美食文化。從夜市小吃到精緻料理，像是香噴噴的滷肉飯、Q彈的珍珠奶茶、鮮甜的牛肉麵，還有各式各樣的糕點和水果。每一道美食都承載著在地人的熱情與智慧，讓人回味無窮。

在現代社會，臺灣在科技創新和民主發展方面也取得了令人矚目的成就。我們在保有傳統文化的同時，也積極擁抱新科技，努力在傳統與現代之間找到最佳的平衡點。這種不斷進取、同時又珍惜歷史的態度，正是臺灣最迷人的地方。

希望透過今天的分享，能讓大家對臺灣有更深一層的認識。也期待未來能有更多機會，與大家一同探索這個充滿魅力和溫暖的寶島。`,
  },
  {
    code: 'fr_FR',
    label: 'French',
    script: `Bonjour à toutes et à tous. Aujourd'hui, j'aimerais vous emmener en voyage à travers la richesse de la culture et de l'histoire française. La France, souvent appelée le pays de l'amour et de l'art, est célèbre pour ses monuments emblématiques comme la Tour Eiffel, le Louvre et les châteaux de la Loire. La langue française, avec sa mélodie et sa précision, est parlée par des millions de personnes à travers le monde et est un pilier de la diplomatie et de la culture.

La gastronomie française est inscrite au patrimoine mondial de l'UNESCO, et ce n'est pas sans raison. Des fromages variés aux vins raffinés, en passant par les pâtisseries délicates comme les croissants et les macarons, chaque plat est une œuvre d'art. Les repas en France sont de véritables célébrations, où l'on prend le temps de savourer chaque instant et de partager avec ses proches. C'est une expérience qui va bien au-delà de la simple nourriture.

Au-delà de sa beauté architecturale et de sa cuisine exquise, la France est également un leader dans la mode, le luxe et l'innovation. Elle a su marier son héritage classique avec une vision moderne, créant une société dynamique qui valorise à la fois la tradition et le progrès. L'esprit français est souvent associé à l'élégance, à la passion et à un certain art de vivre.

Que ce soit en flânant dans les rues de Paris, en explorant les vignobles de Bordeaux ou en se relaxant sur la Côte d'Azur, la France offre une multitude d'expériences. C'est un pays qui invite à la découverte, à la contemplation et à l'émerveillement.

J'espère que cette brève présentation vous aura donné envie d'en apprendre davantage sur la France et de vous immerger dans son charme intemporel.`,
  },
  {
    code: 'de_DE',
    label: 'German',
    script: `Guten Tag zusammen. Heute möchte ich mit Ihnen über die faszinierende Kultur und die reiche Geschichte Deutschlands sprechen. Deutschland ist bekannt für seine tief verwurzelten Traditionen, von den prächtigen Schlössern Bayerns bis zu den historischen Städten wie Berlin und München. Die deutsche Sprache selbst ist ein Spiegelbild dieser Geschichte, präzise und ausdrucksstark, und sie hat viele große Denker und Dichter hervorgebracht.

Die deutsche Küche ist ebenfalls sehr vielfältig und regional geprägt. Denken Sie an deftige Gerichte wie Schweinshaxe und Sauerkraut, aber auch an die unzähligen Brotsorten und die weltberühmten Kuchen und Torten. Jede Region hat ihre eigenen Spezialitäten, die oft mit lokalen Festen und Bräuchen verbunden sind. Ein Besuch auf einem Weihnachtsmarkt oder einem Oktoberfest zeigt die herzliche Gastfreundschaft und die Lebensfreude der Deutschen.

Deutschland ist auch ein Land der Innovation und Technologie. Es ist die Heimat vieler führender Unternehmen in den Bereichen Automobilbau, Ingenieurwesen und Forschung. Diese Kombination aus Tradition und Fortschritt macht Deutschland zu einem einzigartigen Ort, der sowohl seine Vergangenheit ehrt als auch mutig in die Zukunft blickt.

Die deutsche Mentalität wird oft als diszipliniert und effizient beschrieben, aber auch als sehr gastfreundlich und humorvoll, sobald man die anfängliche Zurückhaltung überwindet. Es ist ein Land, das Wert auf Bildung, Kunst und Kultur legt und seinen Bürgern eine hohe Lebensqualität bietet.

Ich hoffe, diese kurze Einführung hat Ihr Interesse an Deutschland geweckt und Sie dazu inspiriert, mehr über dieses vielseitige Land zu erfahren.`,
  },
  {
    code: 'es_ES',
    label: 'Spanish',
    script: `¡Hola a todos! Hoy me gustaría invitaros a un viaje por la rica cultura y la vibrante historia de España. Nuestro país es un crisol de civilizaciones, donde cada rincón cuenta una historia, desde los majestuosos palacios de la Alhambra en Granada hasta la modernista Sagrada Familia en Barcelona. El español, o castellano como lo llamamos aquí, es una lengua llena de pasión y matices, que ha dado al mundo obras literarias inmortales y una forma única de ver la vida.

La gastronomía española es mundialmente famosa y una parte esencial de nuestra identidad. ¿Quién puede resistirse a una buena paella valenciana, unas tapas variadas o un jamón ibérico de bellota? Cada región tiene sus especialidades, y la comida es siempre una excusa perfecta para reunirse con amigos y familiares, disfrutando de la buena compañía y el ambiente festivo. La siesta, aunque menos practicada hoy en día, sigue siendo un símbolo de nuestra filosofía de vida relajada.

España es también un país de contrastes, donde las antiguas tradiciones conviven con la vanguardia artística y tecnológica. Desde el flamenco, Patrimonio Cultural Inmaterial de la Humanidad, hasta los festivales de cine y música contemporánea, siempre hay algo que descubrir. La alegría de vivir, la hospitalidad y el espíritu abierto son características que definen a los españoles.

Nuestras ciudades bullen de actividad, nuestros paisajes naturales son impresionantes y nuestra gente es cálida y acogedora. Es un lugar donde la historia se siente viva en cada callejuela y donde la modernidad se fusiona con el encanto del pasado. Espero que esta breve introducción os anime a explorar más a fondo la magia de España.`,
  },
  {
    code: 'pt_BR',
    label: 'Portuguese (Brazil)',
    script: `Olá a todos! Hoje, quero convidá-los a explorar a exuberância e a diversidade cultural do Brasil. Nosso país é um mosaico de cores, ritmos e sabores, que se estende desde a vastidão da Amazônia até as praias ensolaradas do Nordeste. O português brasileiro, com sua melodia e suas particularidades, reflete a alma de um povo alegre e acolhedor, e é a língua de grandes nomes da nossa música, literatura e arte.

A culinária brasileira é tão rica quanto nossa cultura, com influências indígenas, africanas e europeias. Quem nunca sonhou em provar uma feijoada completa, um pão de queijo quentinho, um brigadeiro delicioso ou um açaí refrescante? Cada região oferece uma experiência gastronômica única, e a comida é sempre um convite à celebração e ao compartilhamento, seja em um churrasco com amigos ou em um almoço de domingo em família.

O Brasil é também sinônimo de festa e alegria. O Carnaval, com seus desfiles grandiosos e blocos de rua, é a maior expressão dessa energia contagiante. Mas a alegria brasileira vai além do Carnaval, manifestando-se na música, na dança, no futebol e na forma calorosa como as pessoas se relacionam. É um país que abraça a diversidade e celebra a vida em todas as suas formas.

Nossas cidades são vibrantes, nossos biomas são de uma beleza indescritível e nosso povo é conhecido pela sua resiliência e otimismo. É um lugar onde a natureza se mostra em sua plenitude e onde a criatividade humana floresce em cada esquina. Espero que esta breve apresentação desperte em vocês a vontade de conhecer e se encantar ainda mais com o Brasil.`,
  },
  {
    code: 'ru_RU',
    label: 'Russian',
    script: `Здравствуйте! Сегодня я хотел бы поговорить с вами о богатой культуре и глубокой истории России. Россия — это страна огромных просторов, где переплетаются древние традиции и современные достижения. От величественных соборов Московского Кремля до бескрайних сибирских лесов, Россия всегда вдохновляла художников, писателей и музыкантов. Русский язык, мощный и выразительный, является ключом к пониманию этой уникальной цивилизации.

Русская кухня, возможно, не так известна в мире, как французская или итальянская, но она не менее разнообразна и вкусна. Борщ, пельмени, блины с икрой — эти блюда стали символами русского гостеприимства. Традиционные чаепития с самоваром и душевные застолья отражают теплоту и щедрость русского народа. Каждое блюдо имеет свою историю и часто связано с семейными традициями.

Помимо кулинарии, Россия славится своим вкладом в мировую литературу, балет, музыку и науку. Имена Достоевского, Толстого, Чайковского, Гагарина известны во всем мире. Это страна, которая всегда стремилась к новым открытиям и глубокому осмыслению человеческого бытия.

Современная Россия — это динамично развивающееся государство, которое сохраняет свою самобытность, одновременно интегрируясь в глобальный мир. Это страна контрастов, где старина соседствует с новейшими технологиями, а суровый климат не мешает людям быть открытыми и радушными.

Надеюсь, этот краткий рассказ пробудил ваш интерес к России и ее многогранной культуре. Возможно, он вдохновит вас на дальнейшее изучение этой удивительной страны.`,
  },
];

export const DEFAULT_RECORDING_SCRIPT_CODE = 'en_US';

export function getRecordingScript(code: string): string {
  const entry = RECORDING_SCRIPTS.find((s) => s.code === code);
  return entry?.script ?? RECORDING_SCRIPTS[0].script;
}
