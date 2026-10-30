import { startCall } from "/realtime-call.js";

const MAX_CALL_SEC = 240; // matches the agent's max_duration_seconds

const T = {
  hy: {
    "nav.who": "Ում համար", "nav.demo": "Դեմո", "nav.features": "Հնարավորություններ", "nav.how": "Միացում", "nav.faq": "Հարցեր",
    "cta.connect": "Միացնել", "cta.connectBiz": "Միացնել բիզնեսը", "cta.callDemo": "Զանգել օգնականին",
    "hero.eyebrow": "ԻԻ ադմինիստրատոր բիզնեսի համար",
    "hero.title": "Ձեր ձեռքերը զբաղված են։ <span class='nw'><em>UMNIK</em>-ը</span> պատասխանում է յուրաքանչյուր հաճախորդի։",
    "hero.sub": "Ընդունում է զանգերն ու հաղորդագրությունները հայերեն և ռուսերեն, ասում է գները և ինքն է գրանցում Ձեր օրացույցում՝ ցերեկը, գիշերը և հանգստյան օրերին։",
    "fact.always": "առանց հանգստյան և ընդմիջման", "fact.langsN": "2 լեզու", "fact.langs": "հայերեն և ռուսերեն", "fact.parallel": "զանգ միաժամանակ",
    "scene.status": "պատասխանում է զանգին", "scene.booked": "Գրանցված է օրացույցում", "scene.tomorrow": "Վաղը",
    "loss.kicker": "Բաց թողնված զանգի գինը",
    "loss.title": "Յուրաքանչյուր անպատասխան զանգ հաճախորդ է, որը գնաց մրցակցի մոտ",
    "loss.sub": "Չպատասխանված հաճախորդը հազվադեպ է հետ զանգում․ նա պարզապես հավաքում է հաջորդ համարը։ Հաշվեք, թե դա Ձեզ ինչ արժե։",
    "pain.1": "Դուք հաճախորդի հետ եք, իսկ հեռախոսը զանգում է ու զանգում",
    "pain.2": "Երեկոյան, գիշերը և հանգստյան օրերին ոչ ոք չի պատասխանում",
    "pain.3": "Ադմինիստրատորը հիվանդ է, արձակուրդում է կամ զբաղված է այլ գործով",
    "calc.title": "Որքա՞ն եք կորցնում", "calc.missed": "Բաց թողնված զանգեր օրական", "calc.check": "Միջին չեկ", "calc.rate": "Նրանցից կգրանցվեին",
    "calc.month": "Կորուստ ամսական", "calc.note": "Հաշվարկը 30 օրվա համար է՝ Ձեր թվերով", "calc.cta": "Դադարել կորցնել հաճախորդներին",
    "ind.kicker": "Ում համար", "ind.title": "Մեկ UMNIK՝ ցանկացած բիզնեսի համար, որտեղ հաճախորդները զանգում են",
    "ind.sub": "Ընտրում եք ոլորտը, ավելացնում Ձեր ծառայություններն ու գները, և օգնականը խոսում է հենց Ձեր բիզնեսի մասին։",
    "ind.live": "Դեմոն աշխատում է", "ind.soon": "Շուտով",
    "ind.barber.t": "Բարբերշոփեր և սրահներ", "ind.barber.d": "Գրանցում, ժամի փոփոխություն, «ես ու ընկերս», գներ և ազատ ժամեր։", "ind.barber.q": "«Թրաշս դզեմ, էգուց 11-ին կարա՞մ գամ»",
    "ind.dental.t": "Ատամնաբուժություններ և կլինիկաներ", "ind.dental.d": "Գրանցում բժշկի մոտ, առաջնային խորհրդատվություն, այցի հիշեցում։", "ind.dental.q": "«Ատամս ցավում է, այսօր կարելի՞ է գալ»",
    "ind.call.t": "Զանգերի կենտրոններ", "ind.call.d": "Առաջին գիծ․ պատասխանում է բնորոշ հարցերին և բարդերը փոխանցում օպերատորին։", "ind.call.q": "«Որտե՞ղ է իմ պատվերը»",
    "ind.office.t": "Գրասենյակներ և ծառայություններ", "ind.office.d": "Խորհրդատվություններ, հանդիպումներ, իրավաբաններ, ավտոսպասարկում՝ գրանցում Ձեր գրաֆիկով։", "ind.office.q": "«Հինգշաբթի օրը կարելի՞ է խորհրդատվության գալ»",
    "ind.food.t": "Արագ սնունդ և առաքում", "ind.food.d": "Ընդունում է պատվերներ հեռախոսով, պատասխանում է մենյուի, հասցեների և աշխատանքային ժամերի մասին։", "ind.food.q": "«Երկու շաուրմա և կոլա, Կոմիտասի վրա»",
    "ind.more.t": "Ձեր բիզնեսը", "ind.more.d": "Ֆիթնես, ավտոլվացում, հյուրանոց, դասընթացներ։ Եթե հաճախորդները զանգում են, UMNIK‑ը կօգնի։", "ind.more.cta": "Քննարկել միացումը →",
    "demo.kicker": "Կենդանի դեմո", "demo.title": "Խոսեք UMNIK‑ի հետ հենց հիմա",
    "demo.sub": "Սա «Blade Barbershop» դեմո բարբերշոփի իրական օգնականն է։ Զանգեք կամ գրեք․ հարցրեք գինը, ազատ ժամը, գրանցվեք, փոխեք գրանցման ժամը։",
    "demo.c1": "Հասկանում է խոսակցական հայերենն ու ռուսերենը", "demo.c2": "Նայում է իրական օրացույցը և գրանցում", "demo.c3": "Պատասխանում է մի քանի վայրկյանում",
    "prices.title": "Դեմո բարբերշոփի գները", "prices.sub": "Այս գները օգնականը վերցնում է անձնական էջից։ Յուրաքանչյուր բիզնես ունի իրենը։",
    "pill.on": "Օգնականը միացված է", "pill.off": "Օգնականն անջատված է",
    "status.ready": "Պատրաստ է", "status.connecting": "Միանում է…", "status.live": "Եթերում", "status.off": "Անջատված է",
    "voice.female": "Անի", "voice.male": "Արամ", "voice.femaleHint": "Կանացի ձայն", "voice.maleHint": "Տղամարդու ձայն",
    "call.start": "Զանգել", "call.end": "Ավարտել",
    "label.idle": "Սեղմեք «Զանգել» և խոսեք ինչպես սովորական զանգի ժամանակ",
    "label.mic": "Թույլատրեք միկրոֆոնը", "label.connected": "Միացված է, խոսեք", "label.speaking": "Խոսում է…", "label.listening": "Լսում է…", "label.hearing": "Հասկանում է…",
    "mode.call": "Զանգել", "mode.chat": "Գրել",
    "chat.placeholder": "Գրեք հաղորդագրություն…", "chat.error": "Չհաջողվեց պատասխանել, փորձեք կրկին։", "chat.booked": "Գրանցված է ✓", "chat.off": "Բիզնեսն անջատել է օգնականին։",
    "label.notHeard": "Չլսեցի, խնդրում եմ կրկնեք", "label.ended": "Զանգն ավարտվեց։ Կարող եք կրկին զանգել։",
    "label.micBlocked": "Միկրոֆոնն արգելափակված է։ Թույլատրեք այն դիտարկիչում և կրկին փորձեք։",
    "label.error": "Չհաջողվեց միանալ, փորձեք մի փոքր ուշ։", "label.quota": "Դեմո րոպեները վերջացել են։ Փորձեք մի փոքր ուշ։", "label.disabled": "Բիզնեսն անջատել է օգնականին։",
    "tool.check": ["Նայում է ազատ ժամերը…", "Ժամերը ստուգված են"], "tool.book": ["Գրանցում է…", "Գրանցված է ✓"], "tool.error": "Համակարգի սխալ", "tool.failed": "Չհաջողվեց գրանցել",
    "try.title": "Փորձեք ասել", "caller.summary": "Զանգողի համարը (դեմո)",
    "caller.hint": "Իրական զանգի ժամանակ համարը որոշվում է ավտոմատ․ այդպես օգնականը գտնում է Ձեր գրանցումները՝ փոխելու կամ չեղարկելու համար։",
    "feat.kicker": "Հնարավորություններ", "feat.title": "Աշխատում է լավագույն ադմինիստրատորի պես։ Միայն չի հոգնում։",
    "f1.t": "Հասկանում է կենդանի խոսքը", "f1.d": "Խոսակցական հայերեն, ժարգոն, ռուսերեն բառեր, ուղղումներ խոսքի ընթացքում՝ «ոչ թե վաղը, այլ վաղը չէ մյուս օրը»։",
    "f2.t": "Գրանցում է, փոխում, չեղարկում", "f2.d": "Ինքն է ստուգում օրացույցը, առաջարկում ազատ ժամ և թույլ չի տալիս կրկնակի գրանցումներ։",
    "f3.t": "Խմբեր և ընկերներ", "f3.d": "«Ես ու ընկերս», «ընկերս չի գալու», «ընկերոջ փոխարեն եղբայրս կգա»․ կողմնորոշվում է ամեն դեպքում։",
    "f4.t": "Ձեր ծառայություններն ու գները", "f4.d": "Օգնականն ասում է միայն այն, ինչ գրել եք անձնական էջում։ Փոխեցիք գինը՝ նա արդեն գիտի։",
    "f5.t": "Զանգեր և չատ՝ մեկ ուղեղ", "f5.d": "Նույն կերպ է պատասխանում հեռախոսով և կայքի չատում։",
    "f6.t": "Որակի վերահսկում", "f6.d": "Յուրաքանչյուր զրույց ստուգում է առանձին ԻԻ մոդել։ Եթե ինչ-որ բան սխալ է եղել, կիմանաք Telegram-ում։",
    "how.kicker": "Միացում", "how.title": "Երեք քայլ մինչև առաջին զանգը",
    "how.1.t": "Գրանցվում եք", "how.1.d": "Ընտրում եք բիզնեսի ոլորտը՝ բարբերշոփ, կլինիկա, գրասենյակ կամ այլ։",
    "how.2.t": "Ավելացնում եք ծառայություններն ու ժամերը", "how.2.d": "Գները, տևողությունը, աշխատանքային գրաֆիկը և վարպետներին՝ անձնական էջում։",
    "how.3.t": "Միացնում ենք Ձեր համարը", "how.3.d": "Զանգերը գնում են UMNIK‑ին, գրանցումները հայտնվում են Ձեր օրացույցում։",
    "cab.kicker": "Անձնական էջ", "cab.title": "Բոլոր գրանցումները՝ մեկ օրացույցում",
    "cab.sub": "Տեսնում եք՝ ով և ինչի համար է գրանցվել։ Փակում եք ժամերը, երբ զբաղված եք։ Փոխում եք ծառայություններն ու գները, և օգնականն անմիջապես խոսում է նորովի։",
    "cab.c1": "Գրանցումների օրացույց ըստ օրերի", "cab.c2": "Փակել ժամերը կամ հանգստյան օրը մեկ սեղմումով", "cab.c3": "Ձեր ծառայությունները, գներն ու տևողությունը", "cab.c4": "Միացնել կամ անջատել օգնականին",
    "cab.mock": "Օրացույց · Ուրբաթ", "cab.e1": "Կտրվածք · 30 րոպե", "cab.e2": "Ֆեյդ + մորուք · UMNIK", "cab.closed": "Փակ է", "cab.e4": "Մորուք · 30 րոպե", "cab.e5": "Կտրվածք · UMNIK",
    "faq.kicker": "Հարցեր", "faq.title": "Հաճախ տրվող հարցեր",
    "faq.1.q": "Հաճախորդները կհասկանա՞ն, որ խոսում են ռոբոտի հետ", "faq.1.a": "Ձայնը բնական է, պատասխանները՝ կարճ, ինչպես կենդանի ադմինիստրատորինը։ Եթե հաճախորդն ուղղակի հարցնի, UMNIK‑ը ազնվորեն կասի, որ ԻԻ օգնական է, և կշարունակի գրանցումը։",
    "faq.2.q": "Իսկ եթե հարցը բարդ է", "faq.2.a": "UMNIK‑ը պատասխաններ չի հորինում։ Եթե տեղեկություն չունի, քաղաքավարի կառաջարկի կապվել ադմինիստրատորի հետ և հարցը կփոխանցի Ձեզ։",
    "faq.3.q": "Ինչպե՞ս միացնել իմ համարը", "faq.3.a": "Ucom-ի, Viva-ի կամ Team-ի Ձեր համարից վերահասցեավորման միջոցով։ Հաճախորդների համար համարը չի փոխվում։",
    "faq.4.q": "Յուրաքանչյուր բիզնես ստանու՞մ է իր օգնականը", "faq.4.a": "Այո։ Յուրաքանչյուր բիզնես ունի իր ծառայությունները, գները, ժամերը և օրացույցը։ Ձեր համարով UMNIK‑ը խոսում է միայն Ձեր բիզնեսի մասին։",
    "faq.5.q": "Որքա՞ն արժե", "faq.5.a": "Կախված է զանգերի քանակից։ Թողեք հայտ, կընտրենք սակագինը և թույլ կտանք փորձել Ձեր հաճախորդների վրա։",
    "faq.6.q": "Ի՞նչ լեզուներով է խոսում", "faq.6.a": "Հայերեն և ռուսերեն, հասկանում է խոսակցական լեզուն և ժարգոնը։ Անգլերենը նույնպես հասկանում է։",
    "final.title": "Թող ոչ մի հաճախորդ այլևս երկար ազդանշաններ չլսի", "final.sub": "Կմիացնենք UMNIK‑ը Ձեր բիզնեսին և համարին։ Առաջին զանգերը՝ փորձնական։",
    "foot.note": "ԻԻ ադմինիստրատոր բիզնեսի համար · Երևան",
    "lead.title": "Միացնել UMNIK‑ը", "lead.sub": "Թողեք Ձեր կոնտակտը․ կկապվենք օրվա ընթացքում և կկարգավորենք օգնականը Ձեր բիզնեսի համար։",
    "lead.name": "Ձեր անունը", "lead.phone": "Հեռախոս կամ Telegram", "lead.industry": "Ոլորտ", "lead.company": "Բիզնեսի անվանումը", "lead.other": "Այլ",
    "lead.send": "Ուղարկել հայտը", "lead.sending": "Ուղարկում ենք…", "lead.ok": "Շնորհակալություն։ Կկապվենք Ձեզ հետ օրվա ընթացքում։", "lead.err": "Չհաջողվեց ուղարկել։ Փորձեք կրկին։", "lead.need": "Լրացրեք անունը և կոնտակտը։",
    "cat.main": "Ծառայություններ", "cat.combo": "Կոմբո", "cat.color": "Երանգավորում", "min": "րոպե", "amd": "դր",
    "scene": [["c", "Բարև, վաղը ժամը 11-ին կտրվածքի համար տեղ կա՞"], ["a", "Վաղը ժամը տասնմեկին ազատ է։ Գրանցե՞մ։"], ["c", "Այո, Արամ եմ"], ["a", "Շատ լավ, Արամ, գրանցեցի։ Սպասում ենք Ձեզ։"]],
    "scene.chip": "Վաղը 11:00 · Կտրվածք · Արամ",
  },
  ru: {
    "nav.who": "Для кого", "nav.demo": "Демо", "nav.features": "Возможности", "nav.how": "Подключение", "nav.faq": "Вопросы",
    "cta.connect": "Подключить", "cta.connectBiz": "Подключить бизнес", "cta.callDemo": "Позвонить ассистенту",
    "hero.eyebrow": "ИИ-администратор для бизнеса",
    "hero.title": "Ваши руки заняты. <em>UMNIK</em> отвечает каждому клиенту.",
    "hero.sub": "Принимает звонки и сообщения на армянском и русском, называет цены и сам записывает в ваш календарь — днём, ночью и в выходные.",
    "fact.always": "без выходных и перерывов", "fact.langsN": "2 языка", "fact.langs": "армянский и русский", "fact.parallel": "звонков одновременно",
    "scene.status": "отвечает на звонок", "scene.booked": "Записан в календарь", "scene.tomorrow": "Завтра",
    "loss.kicker": "Цена пропущенного звонка",
    "loss.title": "Каждый неотвеченный звонок — это клиент, который ушёл к конкуренту",
    "loss.sub": "Клиент, который не дозвонился, редко перезванивает: он просто набирает следующий номер. Посчитайте, сколько это стоит вам.",
    "pain.1": "Вы с клиентом — а телефон звонит и звонит", "pain.2": "Вечером, ночью и в выходные никто не отвечает", "pain.3": "Администратор болеет, в отпуске или занят другим",
    "calc.title": "Сколько вы теряете", "calc.missed": "Пропущенных звонков в день", "calc.check": "Средний чек", "calc.rate": "Из них записались бы",
    "calc.month": "Потери в месяц", "calc.note": "Расчёт на 30 дней по вашим цифрам", "calc.cta": "Перестать терять клиентов",
    "ind.kicker": "Для кого", "ind.title": "Один UMNIK — любой бизнес, где звонят клиенты",
    "ind.sub": "Вы выбираете сферу, добавляете свои услуги и цены — и ассистент говорит именно о вашем бизнесе.",
    "ind.live": "Демо работает", "ind.soon": "Скоро",
    "ind.barber.t": "Барбершопы и салоны", "ind.barber.d": "Запись на стрижку, перенос, «я и друг», цены и свободное время.", "ind.barber.q": "«Թրաշս դզեմ, էգուց 11-ին կարա՞մ գամ»",
    "ind.dental.t": "Стоматологии и клиники", "ind.dental.d": "Запись к врачу, первичная консультация, напоминание о визите.", "ind.dental.q": "«Зуб болит, можно сегодня к врачу?»",
    "ind.call.t": "Колл-центры", "ind.call.d": "Первая линия: отвечает на типовые вопросы и передаёт сложные оператору.", "ind.call.q": "«Где мой заказ?»",
    "ind.office.t": "Офисы и сервисы", "ind.office.d": "Консультации, встречи, юристы, автосервисы — запись по вашему расписанию.", "ind.office.q": "«Можно на консультацию в четверг?»",
    "ind.food.t": "Фастфуд и доставка", "ind.food.d": "Принимает заказы по телефону, отвечает про меню, адреса и время работы.", "ind.food.q": "«Две шаурмы и колу, на Комитаса»",
    "ind.more.t": "Ваш бизнес", "ind.more.d": "Фитнес, автомойки, отели, курсы. Если клиенты звонят — UMNIK поможет.", "ind.more.cta": "Обсудить подключение →",
    "demo.kicker": "Живое демо", "demo.title": "Поговорите с UMNIK прямо сейчас",
    "demo.sub": "Это настоящий ассистент демо-барбершопа «Blade Barbershop». Позвоните или напишите — спросите цену, свободное время, запишитесь, перенесите запись.",
    "demo.c1": "Понимает разговорный армянский и русский", "demo.c2": "Смотрит реальный календарь и записывает", "demo.c3": "Отвечает за пару секунд",
    "prices.title": "Прайс демо-барбершопа", "prices.sub": "Эти цены ассистент берёт из личного кабинета. У каждого бизнеса — свои.",
    "pill.on": "Ассистент включён", "pill.off": "Ассистент выключен",
    "status.ready": "Готов", "status.connecting": "Соединяем…", "status.live": "В эфире", "status.off": "Выключен",
    "voice.female": "Ани", "voice.male": "Арам", "voice.femaleHint": "Женский голос", "voice.maleHint": "Мужской голос",
    "call.start": "Позвонить", "call.end": "Завершить",
    "label.idle": "Нажмите «Позвонить» и говорите, как в обычном звонке",
    "label.mic": "Разрешите доступ к микрофону", "label.connected": "Соединено, говорите", "label.speaking": "Говорит…", "label.listening": "Слушает…", "label.hearing": "Распознаёт…",
    "mode.call": "Позвонить", "mode.chat": "Написать",
    "chat.placeholder": "Напишите сообщение…", "chat.error": "Не удалось ответить, попробуйте ещё раз.", "chat.booked": "Записано ✓", "chat.off": "Бизнес выключил ассистента.",
    "label.notHeard": "Не расслышал, повторите, пожалуйста", "label.ended": "Звонок завершён. Можно позвонить ещё раз.",
    "label.micBlocked": "Микрофон заблокирован. Разрешите его в браузере и попробуйте снова.",
    "label.error": "Не удалось соединиться, попробуйте чуть позже.", "label.quota": "Демо-минуты закончились. Попробуйте чуть позже.", "label.disabled": "Бизнес выключил ассистента.",
    "tool.check": ["Смотрит свободное время…", "Время проверено"], "tool.book": ["Записывает…", "Записано ✓"], "tool.error": "Ошибка системы", "tool.failed": "Не удалось записать",
    "try.title": "Попробуйте сказать", "caller.summary": "Номер звонящего (демо)",
    "caller.hint": "В настоящем звонке номер определяется автоматически: так ассистент находит ваши записи, чтобы перенести или отменить их.",
    "feat.kicker": "Возможности", "feat.title": "Работает как лучший администратор. Только не устаёт.",
    "f1.t": "Понимает живую речь", "f1.d": "Разговорный армянский, сленг, русские слова вперемешку, исправления на ходу — «нет, не завтра, послезавтра».",
    "f2.t": "Записывает, переносит, отменяет", "f2.d": "Сам проверяет календарь, предлагает свободное время и не допускает двойных записей.",
    "f3.t": "Группы и друзья", "f3.d": "«Я и друг», «друг не придёт», «вместо друга придёт брат» — разбирается в каждом случае.",
    "f4.t": "Ваши услуги и цены", "f4.d": "Ассистент говорит только то, что вы записали в кабинете. Поменяли цену — он уже знает.",
    "f5.t": "Звонки и чат — один мозг", "f5.d": "Одинаково отвечает по телефону и в переписке на сайте.",
    "f6.t": "Контроль качества", "f6.d": "Каждый разговор проверяет отдельная ИИ-модель. Если что-то пошло не так — вы узнаете в Telegram.",
    "how.kicker": "Подключение", "how.title": "Три шага до первого звонка",
    "how.1.t": "Регистрируетесь", "how.1.d": "Выбираете сферу бизнеса — барбершоп, клиника, офис или другую.",
    "how.2.t": "Добавляете услуги и часы", "how.2.d": "Цены, длительность, график работы и мастеров — в личном кабинете.",
    "how.3.t": "Подключаем ваш номер", "how.3.d": "Звонки идут на UMNIK, записи появляются в вашем календаре.",
    "cab.kicker": "Личный кабинет", "cab.title": "Все записи — в одном календаре",
    "cab.sub": "Видите, кто записался и на что. Закрываете часы, когда заняты. Меняете услуги и цены — ассистент сразу говорит по-новому.",
    "cab.c1": "Календарь записей по дням", "cab.c2": "Закрыть часы или выходной в один клик", "cab.c3": "Свои услуги, цены и длительность", "cab.c4": "Включить или выключить ассистента",
    "cab.mock": "Календарь · Пятница", "cab.e1": "Стрижка · 30 мин", "cab.e2": "Фейд + борода · UMNIK", "cab.closed": "Закрыто", "cab.e4": "Борода · 30 мин", "cab.e5": "Стрижка · UMNIK",
    "faq.kicker": "Вопросы", "faq.title": "Частые вопросы",
    "faq.1.q": "Клиенты поймут, что говорят с роботом?", "faq.1.a": "Голос естественный, ответы короткие, как у живого администратора. Если клиент прямо спросит — UMNIK честно скажет, что он ИИ-помощник, и продолжит запись.",
    "faq.2.q": "Что, если вопрос сложный?", "faq.2.a": "UMNIK не придумывает ответы. Если информации нет, он вежливо предложит связаться с администратором и передаст вам вопрос.",
    "faq.3.q": "Как подключить мой номер?", "faq.3.a": "Через переадресацию с вашего номера у Ucom, Viva или Team. Номер для клиентов не меняется.",
    "faq.4.q": "Каждый бизнес получает своего ассистента?", "faq.4.a": "Да. У каждого бизнеса свои услуги, цены, часы и календарь. На ваш номер UMNIK отвечает только о вашем бизнесе.",
    "faq.5.q": "Сколько стоит?", "faq.5.a": "Зависит от количества звонков. Оставьте заявку — подберём тариф и дадим попробовать на ваших клиентах.",
    "faq.6.q": "На каких языках говорит?", "faq.6.a": "На армянском и русском, понимает разговорную речь и сленг. Английский тоже понимает.",
    "final.title": "Пусть ни один клиент больше не услышит длинные гудки", "final.sub": "Подключим UMNIK к вашему бизнесу и номеру. Первые звонки — на тест.",
    "foot.note": "ИИ-администратор для бизнеса · Ереван",
    "lead.title": "Подключить UMNIK", "lead.sub": "Оставьте контакт — свяжемся в течение дня и настроим ассистента под ваш бизнес.",
    "lead.name": "Ваше имя", "lead.phone": "Телефон или Telegram", "lead.industry": "Сфера", "lead.company": "Название бизнеса", "lead.other": "Другое",
    "lead.send": "Отправить заявку", "lead.sending": "Отправляем…", "lead.ok": "Спасибо! Свяжемся с вами в течение дня.", "lead.err": "Не удалось отправить. Попробуйте ещё раз.", "lead.need": "Заполните имя и контакт.",
    "cat.main": "Услуги", "cat.combo": "Комбо", "cat.color": "Окрашивание", "min": "мин", "amd": "др",
    "scene": [["c", "Здравствуйте, на завтра в 11 на стрижку есть место?"], ["a", "Завтра в 11:00 свободно. Записать вас?"], ["c", "Да, Арам"], ["a", "Отлично, Арам, записал. Ждём вас!"]],
    "scene.chip": "Завтра 11:00 · Стрижка · Арам",
  },
};

const $ = (id) => document.getElementById(id);
const statusEl = $("status"), orb = $("orb"), label = $("label"), transcript = $("transcript");
const startBtn = $("startBtn"), endBtn = $("endBtn"), fab = $("fab");

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

let lang = T[store.get("bvLang")] ? store.get("bvLang") : navigator.language?.startsWith("ru") ? "ru" : "hy";
let voice = store.get("bvVoice") === "male" ? "male" : "female";
let config = null; // from /api/public/config
let conversation = null; // the running call (realtime-call.js)
let connecting = false;
let timerId = null, rafId = null;
let labelKey = "label.idle";

const t = (key) => T[lang][key] ?? T.ru[key] ?? key;

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  document.querySelectorAll("#langs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  document.querySelectorAll(".voice .av").forEach((el) => (el.textContent = t(`voice.${el.closest(".voice").dataset.voice}`)[0]));
  setLabel(labelKey);
  renderPill();
  renderPrices();
  if (!conversation && !connecting) setStatus(config && !config.enabled ? "off" : "idle");
  landingLang();
}

function setLabel(key) {
  labelKey = key;
  label.textContent = t(key);
}

function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text ?? t({ idle: "status.ready", busy: "status.connecting", live: "status.live", off: "status.off" }[state]);
}

function renderPill() {
  const on = !config || config.enabled;
  $("pillDot").classList.toggle("off", !on);
  $("pillText").textContent = t(on ? "pill.on" : "pill.off");
}

const fmtPrice = (s) => {
  const n = (v) => v.toLocaleString("ru-RU").replace(/ /g, " ");
  return `${s.price_max ? `${n(s.price_min)}–${n(s.price_max)}` : n(s.price_min)} ${t("amd")}`;
};

function renderPrices() {
  if (!config) return;
  const groups = ["main", "combo", "color"].map((cat) => [cat, config.services.filter((s) => s.category === cat)]).filter(([, list]) => list.length);
  $("priceList").replaceChildren(
    ...groups.map(([cat, list]) => {
      const g = document.createElement("div");
      g.className = "price-group";
      g.innerHTML = `<h3></h3>`;
      g.firstChild.textContent = t(`cat.${cat}`);
      for (const s of list) {
        const row = document.createElement("div");
        row.className = "price-row";
        row.innerHTML = `<div class="nm"><b></b><span></span></div><div class="pr"></div>`;
        row.querySelector("b").textContent = lang === "hy" ? s.name_hy : s.name_en;
        row.querySelector(".nm span").textContent = `${lang === "hy" ? s.name_en : s.name_hy} · ${s.duration_min} ${t("min")}`;
        row.querySelector(".pr").textContent = fmtPrice(s);
        g.append(row);
      }
      return g;
    }),
  );
}

async function loadConfig() {
  try {
    const res = await fetch("/api/public/config", { cache: "no-store" });
    config = await res.json();
    $("shopName").textContent = config.shop_name;
  } catch {
    config = null;
  }
  applyLang();
}

function setVoice(v) {
  voice = v;
  store.set("bvVoice", v);
  document.querySelectorAll(".voice").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.voice === v)));
}

function addMessage(text, cls) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  transcript.append(div);
  transcript.scrollTop = transcript.scrollHeight;
  return div;
}

function setInCall(inCall) {
  startBtn.hidden = inCall;
  endBtn.hidden = !inCall;
  $("tries").hidden = inCall;
  $("voices").style.pointerEvents = inCall ? "none" : "";
  $("voices").style.opacity = inCall ? "0.5" : "";
  fab.classList.remove("show");
}

function startTimer() {
  const endsAt = Date.now() + MAX_CALL_SEC * 1000;
  const tick = () => {
    const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    setStatus("live", `${t("status.live")} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
    if (!left) stopCall(); // demo calls are capped so a forgotten tab doesn't burn minutes
  };
  tick();
  timerId = setInterval(tick, 1000);
}

function animateOrb() {
  if (!conversation) return;
  orb.style.setProperty("--level", conversation.level().toFixed(3));
  rafId = requestAnimationFrame(animateOrb);
}

function resetUi(key) {
  clearInterval(timerId);
  cancelAnimationFrame(rafId);
  orb.style.setProperty("--level", 0);
  orb.dataset.mode = "idle";
  setStatus(config && !config.enabled ? "off" : "idle");
  setLabel(key);
  setInCall(false);
}

function stopCall(key = "label.ended") {
  conversation?.stop();
  conversation = null;
  resetUi(key);
}

// Texts the shared call module asks for.
const callText = (key) =>
  ({
    "tool.check": t("tool.check")[0],
    "tool.checked": t("tool.check")[1],
    "tool.book": t("tool.book")[0],
    "tool.booked": t("tool.book")[1],
    "tool.failed": t("tool.failed"),
    "tool.error": t("tool.error"),
    "voice.error": t("label.error"),
  })[key] ?? key;

const CALL_STATES = { connected: "label.connected", hearing: "label.listening", answering: "label.hearing", listening: "label.listening", unstable: "label.error", failed: "label.error", quota: "label.quota" };

async function start() {
  if (conversation || connecting) return;
  await loadConfig(); // pick up the barber's latest prices / on-off switch
  if (!config) return setLabel("label.error");
  if (!config.enabled) return setLabel("label.disabled");

  connecting = true;
  setStatus("busy");
  setLabel("label.mic");
  setInCall(true);
  transcript.replaceChildren();

  try {
    // OpenAI Realtime hears and thinks, ElevenLabs speaks Armenian (see realtime-call.js)
    conversation = await startCall(
      { voice, caller: $("callerPhone").value.trim() },
      {
        add: addMessage,
        t: callText,
        state: (s) => {
          setLabel(CALL_STATES[s] ?? "label.listening");
          if (s === "failed") stopCall("label.error");
          if (s === "quota") stopCall("label.quota");
        },
        speaking: (on) => {
          orb.dataset.mode = on ? "speaking" : "listening";
          if (on) setLabel("label.speaking");
        },
      },
    );
    orb.dataset.mode = "listening";
    startTimer();
    animateOrb();
  } catch (err) {
    console.error(err);
    conversation = null;
    const msg = String(err?.message ?? err);
    resetUi(/Permission|NotAllowed|getUserMedia/i.test(msg) ? "label.micBlocked" : msg === "disabled" ? "label.disabled" : /quota|credits/i.test(msg) ? "label.quota" : "label.error");
  } finally {
    connecting = false;
  }
}

// ---------------------------------------------------------------- chat (same brain as the voice assistant)

const chatLog = $("chatLog");
let chatId = null, chatHistory = [], chatBusy = false;

function chatAdd(text, cls) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  chatLog.append(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

async function openChat() {
  if (chatHistory.length) return;
  if (!config) await loadConfig();
  if (config && !config.enabled) return chatAdd(t("chat.off"), "tool");
  const greeting = (config?.greeting ?? "Բարև ձեզ։ Ինչո՞վ օգնեմ։").replaceAll("{shop}", config?.shop_name ?? "").replaceAll("{name}", "Անի");
  chatHistory.push({ role: "assistant", content: greeting });
  chatAdd(greeting, "agent");
}

async function sendChat(text) {
  text = text.trim();
  if (!text || chatBusy) return;
  chatBusy = true;
  $("chatChips").hidden = true;
  chatHistory.push({ role: "user", content: text });
  chatAdd(text, "user");
  const typing = chatAdd("•••", "agent typing");
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: chatId, messages: chatHistory }) });
    const data = await res.json();
    if (!res.ok || !data.reply) throw new Error(data.error || res.status);
    chatId = data.id;
    typing.remove();
    chatHistory.push({ role: "assistant", content: data.reply });
    if (data.booked) chatAdd(t("chat.booked"), "tool ok");
    chatAdd(data.reply, "agent");
  } catch (err) {
    console.error(err);
    typing.remove();
    chatHistory.pop();
    chatAdd(t("chat.error"), "tool");
  } finally {
    chatBusy = false;
    $("chatInput").focus();
  }
}

$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("chatInput");
  sendChat(input.value);
  input.value = "";
});
document.querySelectorAll("#chatChips .chip").forEach((c) => c.addEventListener("click", () => sendChat(c.textContent)));
document.querySelectorAll(".modes button").forEach((b) =>
  b.addEventListener("click", () => {
    if (conversation || connecting) return; // finish the call first
    const chat = b.dataset.mode === "chat";
    document.querySelectorAll(".modes button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    $("chatPane").hidden = !chat;
    $("callPane").hidden = chat;
    if (chat) fab.classList.remove("show");
    if (chat) openChat();
  }),
);

startBtn.addEventListener("click", start);
endBtn.addEventListener("click", () => stopCall());
document.querySelectorAll("[data-start]").forEach((el) =>
  el.addEventListener("click", () => {
    $("assistant").scrollIntoView({ behavior: "smooth", block: "center" });
    document.querySelector('.modes button[data-mode="call"]')?.click();
    start();
  }),
);
document.querySelectorAll(".voice").forEach((b) => b.addEventListener("click", () => setVoice(b.dataset.voice)));
document.querySelectorAll("#langs button").forEach((b) =>
  b.addEventListener("click", () => {
    lang = b.dataset.lang;
    store.set("bvLang", lang);
    applyLang();
  }),
);
$("callerPhone").value = store.get("bvCaller") ?? "";
$("callerPhone").addEventListener("change", (e) => store.set("bvCaller", e.target.value.trim()));

// Floating call button appears on phones once the demo card scrolls away.
// On the landing it waits until the hero (with its own call button) is scrolled past.
let demoVisible = true;
const updateFab = () => fab.classList.toggle("show", !demoVisible && scrollY > innerHeight * 0.8 && !conversation && !connecting && $("chatPane").hidden);
new IntersectionObserver(([entry]) => { demoVisible = entry.isIntersecting; updateFab(); }, { threshold: 0.15 }).observe($("assistant"));
addEventListener("scroll", updateFab, { passive: true });

// ---------------------------------------------------------------- landing: scene, calculator, reveal, lead form

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Hero: a short call plays out line by line and lands in the mini calendar, then starts over.
let sceneRun = 0;
async function playScene() {
  const run = ++sceneRun;
  const body = $("sceneBody"), chip = $("sceneChip"), slot = $("sceneSlot");
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
  const alive = () => run === sceneRun;
  body.replaceChildren();
  chip.classList.remove("show");
  slot.classList.remove("filled");
  $("sceneChipText").textContent = t("scene.chip");
  for (const [who, text] of t("scene")) {
    if (who === "a" && !reduceMotion) {
      const dots = document.createElement("div");
      dots.className = "sb a typing";
      dots.textContent = "•••";
      body.append(dots);
      await wait(900);
      if (!alive()) return;
      dots.remove();
    }
    const b = document.createElement("div");
    b.className = `sb ${who}`;
    b.textContent = text;
    body.append(b);
    await wait(who === "c" ? 1500 : 1300);
    if (!alive()) return;
  }
  slot.classList.add("filled");
  chip.classList.add("show");
  if (reduceMotion) return;
  await wait(4200);
  if (alive()) playScene();
}

// Loss calculator: missed calls a day × share that would book × average check × 30 days.
const fmtAmd = (n) => `${Math.round(n).toLocaleString("ru-RU").replace(/\u00a0/g, " ")} ֏`;
function calc() {
  const missed = +$("rMissed").value, check = +$("rCheck").value, rate = +$("rRate").value;
  $("vMissed").textContent = missed;
  $("vCheck").textContent = fmtAmd(check);
  $("vRate").textContent = `${rate}%`;
  $("calcOut").textContent = fmtAmd(missed * (rate / 100) * check * 30);
  for (const r of document.querySelectorAll("#calc input[type=range]")) r.style.setProperty("--p", `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
}
document.querySelectorAll("#calc input[type=range]").forEach((r) => r.addEventListener("input", calc));

function landingLang() {
  if (!$("sceneBody")) return;
  document.title = lang === "hy" ? "UMNIK — ԻԻ ադմինիստրատոր, որը պատասխանում է յուրաքանչյուր հաճախորդի" : "UMNIK — ИИ-администратор, который отвечает каждому клиенту";
  calc();
  playScene();
}

// Blocks fade in as they scroll into view.
const revealer = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); revealer.unobserve(e.target); }
}, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

addEventListener("scroll", () => $("top").classList.toggle("scrolled", scrollY > 8), { passive: true });

// Lead form ("Connect your business"): goes to /api/lead → the owner's Telegram.
const leadDialog = $("leadDialog"), leadForm = $("leadForm"), leadMsg = $("leadMsg");
document.querySelectorAll("[data-lead]").forEach((b) => b.addEventListener("click", () => {
  leadMsg.textContent = "";
  leadMsg.className = "lead-msg";
  $("leadSubmit").disabled = false;
  leadDialog.showModal();
}));
$("leadClose").addEventListener("click", () => leadDialog.close());
leadDialog.addEventListener("click", (e) => { if (e.target === leadDialog) leadDialog.close(); });
leadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(leadForm));
  if (!data.name.trim() || !data.contact.trim()) {
    leadMsg.textContent = t("lead.need");
    leadMsg.className = "lead-msg err";
    return;
  }
  $("leadSubmit").disabled = true;
  leadMsg.textContent = t("lead.sending");
  leadMsg.className = "lead-msg";
  try {
    const res = await fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, lang }) });
    if (!res.ok) throw new Error(String(res.status));
    leadMsg.textContent = t("lead.ok");
    leadMsg.className = "lead-msg ok";
    leadForm.reset();
  } catch {
    leadMsg.textContent = t("lead.err");
    leadMsg.className = "lead-msg err";
    $("leadSubmit").disabled = false;
  }
});

setVoice(voice);
applyLang();
loadConfig();
