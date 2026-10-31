// Test phrases for the recognition benchmark: the caller reads each one, scripts/bench.mjs runs every
// recording through the recognizers and scores them against this text. `noisy` ones are read twice:
// once in a quiet room and once with noise (street, TV, car).
export const PHRASES = [
  // yes / no — the short answers that got lost
  { id: 1, text: "Հա", kind: "yesno", noisy: true },
  { id: 2, text: "Այո, այո", kind: "yesno", noisy: true },
  { id: 3, text: "Չէ, պետք չի", kind: "yesno", noisy: true },
  { id: 4, text: "Հա, ճիշտ ա", kind: "yesno" },
  { id: 5, text: "Օքեյ, եղավ", kind: "yesno" },
  // phone numbers
  { id: 6, text: "Զրո իննսունինը, քսանյոթ, քսանութ, հիսունհինգ", kind: "number", digits: "099272855", noisy: true },
  { id: 7, text: "Զրո յոթանասունյոթ, տասներկու, երեսունչորս, հիսունվեց", kind: "number", digits: "077123456", noisy: true },
  { id: 8, text: "Զրո իննսունութ, ութսունութ, իննսունմեկ, զրո հինգ", kind: "number", digits: "098889105", noisy: true },
  { id: 9, text: "Զրո իննսունչորս, քառասուն, վաթսուներկու, ութսունութ", kind: "number", digits: "094406288", noisy: true },
  { id: 10, text: "Հիսունհինգ, քսանութ, ութսունութ, ութսունութ", kind: "number", digits: "55288888", noisy: true },
  { id: 11, text: "Զրո իննսունմեկ, տասնհինգ, յոթանասուն, երեսուն", kind: "number", digits: "091157030" },
  // names
  { id: 12, text: "Սամվել", kind: "name" },
  { id: 13, text: "Արամն եմ", kind: "name" },
  { id: 14, text: "Անունս Դավիթ ա", kind: "name" },
  { id: 15, text: "Վահագն", kind: "name" },
  { id: 16, text: "Տիգրան, Տիգրան Պետրոսյան", kind: "name" },
  // days and times
  { id: 17, text: "Էգուց ժամը տասնմեկին", kind: "time", noisy: true },
  { id: 18, text: "Էսօր երեկոյան յոթի կողմերը", kind: "time" },
  { id: 19, text: "Վաղը չէ մյուս օրը, մեկ ու կեսին", kind: "time" },
  { id: 20, text: "Շաբաթ օրը առավոտը, ինչքան շուտ, էնքան լավ", kind: "time" },
  { id: 21, text: "Ճաշից հետո ազատ ե՞ք", kind: "time" },
  // services, slang
  { id: 22, text: "Ախպեր ջան, թրաշս դզեմ, էգուց կարա՞մ գամ", kind: "service", noisy: true },
  { id: 23, text: "Մազերս ներկեմ, ինչքա՞ն ա", kind: "service" },
  { id: 24, text: "Ֆեյդ ու մորուք, ընդհանուր ինչքա՞ն կլնի", kind: "service" },
  { id: 25, text: "Տղայիս համար ստրիժկա, մի հատ էլ ինձ համար մաշինկայով", kind: "service" },
  { id: 26, text: "Կողքերը զրո, վրան մկրատով, էսօր տեղ կա՞", kind: "service" },
  // longer, conversational — several questions at once
  { id: 27, text: "Ես արդեն գրանցված եմ թրաշի համար, մազերս մոռացա ասեմ, մազերն էլ ավելացրեք։ Ընդհանուր ինչքա՞ն կլնի, ու ինչքա՞ն կտևի", kind: "complex" },
  { id: 28, text: "Բարև, հենց հիմա կարա՞մ գամ", kind: "complex", noisy: true },
  { id: 29, text: "Իսկ ե՞րբ, կես ժամից, մի ժամից, թե՞ որն ա ամենահարմար ժամը", kind: "complex", noisy: true },
  { id: 30, text: "Կես ժամից կհասնեմ, կսպասե՞ք", kind: "complex" },
  { id: 31, text: "Եթե հիմա չի ստացվում, ամենամոտ ազատ ժամը ո՞րն ա", kind: "complex" },
  { id: 32, text: "Ես ու ախպերս ենք գալու, ես ֆեյդ, ինքը մենակ թրաշ, էգուց չորսին կլնի՞", kind: "complex", noisy: true },
  { id: 33, text: "Ժամս կարա՞մ փոխեմ, չորսի տեղը հինգին", kind: "complex" },
  { id: 34, text: "Չէ, մի րոպե, ոչ թե վաղը, այլ վաղը չէ մյուս օրը", kind: "complex" },
  { id: 35, text: "Ինչքան շուտ, էնքան լավ, ուղղակի մինչև վեցը պետք ա պրծնեմ", kind: "complex" },
  { id: 36, text: "Մի տասը րոպե ուշանում եմ, խնդիր չկա՞", kind: "complex" },
  { id: 37, text: "Ո՞ր ժամին եմ գրանցված, մոռացել եմ", kind: "complex" },
  { id: 38, text: "Քարտով կարա՞մ վճարեմ, թե՞ մենակ կեշ", kind: "complex" },
  { id: 39, text: "Էսօր մինչև ժամը քանիսն եք աշխատում, ու հասցեն ասեք", kind: "complex" },
  { id: 40, text: "Էս համարով գրանցեք, որից զանգում եմ", kind: "complex" },
  { id: 41, text: "Գրանցեք, բայց համարս ուրիշ ա, զրո իննսունինը, տասներկու, երեսունչորս, հիսունվեց", kind: "number", digits: "099123456" },
  { id: 42, text: "Մազերս, թրաշս, հետո էլ ֆենով սարքեն, ընդհանուր ինչքան ժամանակ կտևի", kind: "complex" },
  { id: 43, text: "Ալո, լսո՞ւմ եք, ձայնը կտրվում ա", kind: "complex" },
  { id: 44, text: "Լավ, մերսի, ախպեր, կգամ", kind: "complex" },
  { id: 45, text: "Չէ, էդ ժամը չի սազում, մի քիչ ավելի ուշ չկա՞", kind: "complex" },
];
