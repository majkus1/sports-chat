import { OpenAI } from 'openai';
import connectToDb from '@/lib/db';
import MatchAnalysis from '@/models/MatchAnalysis';

export async function POST(request) {
  console.log('=== getOrCreateAnalysis endpoint called ===');
  console.log('Request method:', request.method);
  console.log('Request URL:', request.url);
  
  try {
    const body = await request.json();
    console.log('Request body received, fixtureId:', body?.fixtureId);
    
    const {
      fixtureId,
      prediction,
      homeTeam,
      awayTeam,
      homeStats,
      awayStats,
      isLive,
      currentGoals,
      language: bodyLang,
    } = body || {};

    const headerLang = request.headers.get('x-lang') || request.headers.get('accept-language') || '';
    const detected = (bodyLang || String(headerLang)).toLowerCase();
    const lang2 = detected.startsWith('pl') ? 'pl' : detected.startsWith('en') ? 'en' : 'pl';

    if (!isLive) {
      await connectToDb();

      const existingAnalysis = await MatchAnalysis.findOne({ fixtureId, language: lang2 });

      if (existingAnalysis) {
        return Response.json({ analysis: existingAnalysis.analysis }, { status: 200 });
      }
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 2,
    });

    const prompts = {
      en: isLive
        ? `Please provide a concise but specific textual analysis of the football match currently taking place between ${homeTeam} and ${awayTeam}. The current score is ${homeTeam} ${currentGoals.home} - ${currentGoals.away} ${awayTeam}. Always start the analysis by mentioning the current score; make sure to always begin with this.

Statistics for the home team, ${homeTeam}, from their matches so far:
Total matches played: ${homeStats.playedTotal}
Total matches won: ${homeStats.winstotal}
Total home matches won: ${homeStats.winshome}
Total away matches won: ${homeStats.winsaway}
Total matches drawn: ${homeStats.drawstotal}
Total home matches drawn: ${homeStats.drawshome}
Total away matches drawn: ${homeStats.drawsaway}
Total matches lost: ${homeStats.losestotal}
Total home matches lost: ${homeStats.loseshome}
Total away matches lost: ${homeStats.losesaway}
Form: ${homeStats.form}
Matches with over 0.5 goals scored: ${homeStats.goalsOver05}
Matches with under 0.5 goals scored: ${homeStats.goalsUnder05}
Matches with over 1.5 goals scored: ${homeStats.goalsOver15}
Matches with under 1.5 goals scored: ${homeStats.goalsUnder15}
Matches with over 2.5 goals scored: ${homeStats.goalsOver25}
Matches with under 2.5 goals scored: ${homeStats.goalsUnder25}
Matches with over 3.5 goals scored: ${homeStats.goalsOver35}
Matches with under 3.5 goals scored: ${homeStats.goalsUnder35}
Total goals scored: ${homeStats.goalsfortotal}
Total home goals scored: ${homeStats.goalsforhome}
Total away goals scored: ${homeStats.goalsforaway}
Matches with over 0.5 goals conceded: ${homeStats.goalsOver05aga}
Matches with under 0.5 goals conceded: ${homeStats.goalsUnder05aga}
Matches with over 1.5 goals conceded: ${homeStats.goalsOver15aga}
Matches with under 1.5 goals conceded: ${homeStats.goalsUnder15aga}
Matches with over 2.5 goals conceded: ${homeStats.goalsOver25aga}
Matches with under 2.5 goals conceded: ${homeStats.goalsUnder25aga}
Matches with over 3.5 goals conceded: ${homeStats.goalsOver35aga}
Matches with under 3.5 goals conceded: ${homeStats.goalsUnder35aga}
Total goals conceded: ${homeStats.goalsagatotal}
Total home goals conceded: ${homeStats.goalsagahome}
Total away goals conceded: ${homeStats.goalsagaaway}
Total clean sheets: ${homeStats.cleansheettotal}
Home clean sheets: ${homeStats.cleansheethome}
Away clean sheets: ${homeStats.cleansheetaway}
Matches without scoring: ${homeStats.failedtoscoretotal}
Home matches without scoring: ${homeStats.failedtoscorehome}
Away matches without scoring: ${homeStats.failedtoscoreaway}
Statistics for the away team, ${awayTeam}, from their matches so far:
Total matches played: ${awayStats.playedTotal}
Total matches won: ${awayStats.winstotal}
Total home matches won: ${awayStats.winshome}
Total away matches won: ${awayStats.winsaway}
Total matches drawn: ${awayStats.drawstotal}
Total home matches drawn: ${awayStats.drawshome}
Total away matches drawn: ${awayStats.drawsaway}
Total matches lost: ${awayStats.losestotal}
Total home matches lost: ${awayStats.loseshome}
Total away matches lost: ${awayStats.losesaway}
Form: ${awayStats.form}
Matches with over 0.5 goals scored: ${awayStats.goalsOver05}
Matches with under 0.5 goals scored: ${awayStats.goalsUnder05}
Matches with over 1.5 goals scored: ${awayStats.goalsOver15}
Matches with under 1.5 goals scored: ${awayStats.goalsUnder15}
Matches with over 2.5 goals scored: ${awayStats.goalsOver25}
Matches with under 2.5 goals scored: ${awayStats.goalsUnder25}
Matches with over 3.5 goals scored: ${awayStats.goalsOver35}
Matches with under 3.5 goals scored: ${awayStats.goalsUnder35}
Total goals scored: ${awayStats.goalsfortotal}
Total home goals scored: ${awayStats.goalsforhome}
Total away goals scored: ${awayStats.goalsforaway}
Matches with over 0.5 goals conceded: ${awayStats.goalsOver05aga}
Matches with under 0.5 goals conceded: ${awayStats.goalsUnder05aga}
Matches with over 1.5 goals conceded: ${awayStats.goalsOver15aga}
Matches with under 1.5 goals conceded: ${awayStats.goalsUnder15aga}
Matches with over 2.5 goals conceded: ${awayStats.goalsOver25aga}
Matches with under 2.5 goals conceded: ${awayStats.goalsUnder25aga}
Matches with over 3.5 goals conceded: ${awayStats.goalsOver35aga}
Matches with under 3.5 goals conceded: ${awayStats.goalsUnder35aga}
Total goals conceded: ${awayStats.goalsagatotal}
Total home goals conceded: ${awayStats.goalsagahome}
Total away goals conceded: ${awayStats.goalsagaaway}
Total clean sheets: ${awayStats.cleansheettotal}
Home clean sheets: ${awayStats.cleansheethome}
Away clean sheets: ${awayStats.cleansheetaway}
Matches without scoring: ${awayStats.failedtoscoretotal}
Home matches without scoring: ${awayStats.failedtoscorehome}
Away matches without scoring: ${awayStats.failedtoscoreaway}
Provide a detailed analysis based on the data above. Write only the analysis and conclusion without introductory phrases such as "based on the provided data" or "analyzing the above statistics."

At the end, always include your prediction for the match, which should cover only a draw or a win for one of the teams (double chance). Always use this format:
Prediction: Roma to win or draw.`
        : `Please provide a concise but specific textual analysis of the upcoming football match between ${homeTeam} and ${awayTeam}. Propably result: ${prediction}

Statistics for the home team, ${homeTeam}:
Total matches played: ${homeStats.playedTotal}

Total matches won: ${homeStats.winstotal}

Total home matches won: ${homeStats.winshome}

Total away matches won: ${homeStats.winsaway}

Total matches drawn: ${homeStats.drawstotal}

Total home matches drawn: ${homeStats.drawshome}

Total away matches drawn: ${homeStats.drawsaway}

Total matches lost: ${homeStats.losestotal}

Total home matches lost: ${homeStats.loseshome}

Total away matches lost: ${homeStats.losesaway}

Form: ${homeStats.form}

Matches with over 0.5 goals scored: ${homeStats.goalsOver05}

Matches with under 0.5 goals scored: ${homeStats.goalsUnder05}

Matches with over 1.5 goals scored: ${homeStats.goalsOver15}

Matches with under 1.5 goals scored: ${homeStats.goalsUnder15}

Matches with over 2.5 goals scored: ${homeStats.goalsOver25}

Matches with under 2.5 goals scored: ${homeStats.goalsUnder25}

Matches with over 3.5 goals scored: ${homeStats.goalsOver35}

Matches with under 3.5 goals scored: ${homeStats.goalsUnder35}

Total goals scored: ${homeStats.goalsfortotal}

Total home goals scored: ${homeStats.goalsforhome}

Total away goals scored: ${homeStats.goalsforaway}

Matches with over 0.5 goals conceded: ${homeStats.goalsOver05aga}

Matches with under 0.5 goals conceded: ${homeStats.goalsUnder05aga}

Matches with over 1.5 goals conceded: ${homeStats.goalsOver15aga}

Matches with under 1.5 goals conceded: ${homeStats.goalsUnder15aga}

Matches with over 2.5 goals conceded: ${homeStats.goalsOver25aga}

Matches with under 2.5 goals conceded: ${homeStats.goalsUnder25aga}

Matches with over 3.5 goals conceded: ${homeStats.goalsOver35aga}

Matches with under 3.5 goals conceded: ${homeStats.goalsUnder35aga}

Total goals conceded: ${homeStats.goalsagatotal}

Total home goals conceded: ${homeStats.goalsagahome}

Total away goals conceded: ${homeStats.goalsagaaway}

Total clean sheets: ${homeStats.cleansheettotal}

Home clean sheets: ${homeStats.cleansheethome}

Away clean sheets: ${homeStats.cleansheetaway}

Total matches without scoring: ${homeStats.failedtoscoretotal}

Home matches without scoring: ${homeStats.failedtoscorehome}

Away matches without scoring: ${homeStats.failedtoscoreaway}

Statistics for the away team, ${awayTeam}:
Total matches played: ${awayStats.playedTotal}

Total matches won: ${awayStats.winstotal}

Total home matches won: ${awayStats.winshome}

Total away matches won: ${awayStats.winsaway}

Total matches drawn: ${awayStats.drawstotal}

Total home matches drawn: ${awayStats.drawshome}

Total away matches drawn: ${awayStats.drawsaway}

Total matches lost: ${awayStats.losestotal}

Total home matches lost: ${awayStats.loseshome}

Total away matches lost: ${awayStats.losesaway}

Form: ${awayStats.form}

Matches with over 0.5 goals scored: ${awayStats.goalsOver05}

Matches with under 0.5 goals scored: ${awayStats.goalsUnder05}

Matches with over 1.5 goals scored: ${awayStats.goalsOver15}

Matches with under 1.5 goals scored: ${awayStats.goalsUnder15}

Matches with over 2.5 goals scored: ${awayStats.goalsOver25}

Matches with under 2.5 goals scored: ${awayStats.goalsUnder25}

Matches with over 3.5 goals scored: ${awayStats.goalsOver35}

Matches with under 3.5 goals scored: ${awayStats.goalsUnder35}

Total goals scored: ${awayStats.goalsfortotal}

Total home goals scored: ${awayStats.goalsforhome}

Total away goals scored: ${awayStats.goalsforaway}

Matches with over 0.5 goals conceded: ${awayStats.goalsOver05aga}

Matches with under 0.5 goals conceded: ${awayStats.goalsUnder05aga}

Matches with over 1.5 goals conceded: ${awayStats.goalsOver15aga}

Matches with under 1.5 goals conceded: ${awayStats.goalsUnder15aga}

Matches with over 2.5 goals conceded: ${awayStats.goalsOver25aga}

Matches with under 2.5 goals conceded: ${awayStats.goalsUnder25aga}

Matches with over 3.5 goals conceded: ${awayStats.goalsOver35aga}

Matches with under 3.5 goals conceded: ${awayStats.goalsUnder35aga}

Total goals conceded: ${awayStats.goalsagatotal}

Total home goals conceded: ${awayStats.goalsagahome}

Total away goals conceded: ${awayStats.goalsagaaway}

Total clean sheets: ${awayStats.cleansheettotal}

Home clean sheets: ${awayStats.cleansheethome}

Away clean sheets: ${awayStats.cleansheetaway}

Total matches without scoring: ${awayStats.failedtoscoretotal}

Home matches without scoring: ${awayStats.failedtoscorehome}

Away matches without scoring: ${awayStats.failedtoscoreaway}

Please provide a detailed analysis based on the above data. Write only the analysis and conclusion without introductory phrases such as "based on the provided data" or "analyzing the above statistics."

At the end, always include your prediction for the match given the likely outcome: ${prediction}, which should cover only a draw or a win for one of the teams (double chance). Always use this format:
Prediction: Roma to win or draw.`,

      pl: isLive
        ? `Proszę o krótką ale konkretną analize tekstową meczu piłki nożnej, który aktualnie trwa między ${homeTeam} a ${awayTeam}. Aktualny wynik meczu to ${homeTeam} ${currentGoals.home} - ${currentGoals.away} ${awayTeam}. Zawsze zaczynaj analizę od wspomnienia aktualnego wyniku, pamiętaj o tym zawsze aby od tego zaczynać.

Statystyki gospodarzy ${homeTeam} z dotychczasowych meczów:
- Liczba rozegranych meczów: ${homeStats.playedTotal}
- Łączna liczba wygranych meczów: ${homeStats.winstotal}
- Łączna liczba wygranych meczów u siebie: ${homeStats.winshome}
- Łączna liczba wygranych meczów na wyjeździe: ${homeStats.winsaway}
- Łączna liczba zremisowanych meczów: ${homeStats.drawstotal}
- Łączna liczba zremisowanych meczów u siebie: ${homeStats.drawshome}
- Łączna liczba zremisowanych meczów na wyjeździe: ${homeStats.drawsaway}
- Łączna liczba przegranych meczów: ${homeStats.losestotal}
- Łączna liczba przegranych meczów u siebie: ${homeStats.loseshome}
- Łączna liczba przegranych meczów na wyjeździe: ${homeStats.losesaway}
- Forma: ${homeStats.form}
- Mecze ze zdobytymi golami ponad 0.5: ${homeStats.goalsOver05}
- Mecze ze zdobytymi golami poniżej 0.5: ${homeStats.goalsUnder05}
- Mecze ze zdobytymi golami ponad 1.5: ${homeStats.goalsOver15}
- Mecze ze zdobytymi golami poniżej 1.5: ${homeStats.goalsUnder15}
- Mecze ze zdobytymi golami ponad 2.5: ${homeStats.goalsOver25}
- Mecze ze zdobytymi golami poniżej 2.5: ${homeStats.goalsUnder25}
- Mecze ze zdobytymi golami ponad 3.5: ${homeStats.goalsOver35}
- Mecze ze zdobytymi golami poniżej 3.5: ${homeStats.goalsUnder35}
- Łączna ilość zdobytych goli: ${homeStats.goalsfortotal}
- Łączna ilość zdobytych goli u siebie: ${homeStats.goalsforhome}
- Łączna ilość zdobytych goli na wyjeździe: ${homeStats.goalsforaway}

- Mecze ze straconymi golami ponad 0.5: ${homeStats.goalsOver05aga}
- Mecze ze straconymi golami poniżej 0.5: ${homeStats.goalsUnder05aga}
- Mecze ze straconymi golami ponad 1.5: ${homeStats.goalsOver15aga}
- Mecze ze straconymi golami poniżej 1.5: ${homeStats.goalsUnder15aga}
- Mecze ze straconymi golami ponad 2.5: ${homeStats.goalsOver25aga}
- Mecze ze straconymi golami poniżej 2.5: ${homeStats.goalsUnder25aga}
- Mecze ze straconymi golami ponad 3.5: ${homeStats.goalsOver35aga}
- Mecze ze straconymi golami poniżej 3.5: ${homeStats.goalsUnder35aga}
- Łączna ilość straconych goli: ${homeStats.goalsagatotal}
- Łączna ilość straconych goli u siebie: ${homeStats.goalsagahome}
- Łączna ilość straconych goli na wyjeździe: ${homeStats.goalsagaaway}

- Łączna ilość meczy z czystym kontem: ${homeStats.cleansheettotal}
- Łączna ilość meczy z czystym kontem w meczach domowych: ${homeStats.cleansheethome}
- Łączna ilość meczy z czystym kontem w meczach wyjazdowych: ${homeStats.cleansheetaway}

- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki: ${homeStats.failedtoscoretotal}
- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki u siebie: ${homeStats.failedtoscorehome}
- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki na wyjeździe: ${homeStats.failedtoscoreaway}

Statystyki gości ${awayTeam} z dotychczasowych meczów:
- Liczba rozegranych meczów: ${awayStats.playedTotal}
- Łączna liczba wygranych meczów: ${awayStats.winstotal}
- Łączna liczba wygranych meczów u siebie: ${awayStats.winshome}
- Łączna liczba wygranych meczów na wyjeździe: ${awayStats.winsaway}
- Łączna liczba zremisowanych meczów: ${awayStats.drawstotal}
- Łączna liczba zremisowanych meczów u siebie: ${awayStats.drawshome}
- Łączna liczba zremisowanych meczów na wyjeździe: ${awayStats.drawsaway}
- Łączna liczba przegranych meczów: ${awayStats.losestotal}
- Łączna liczba przegranych meczów u siebie: ${awayStats.loseshome}
- Łączna liczba przegranych meczów na wyjeździe: ${awayStats.losesaway}
- Forma: ${awayStats.form}
- Mecze ze zdobytymi golami ponad 0.5: ${awayStats.goalsOver05}
- Mecze ze zdobytymi golami poniżej 0.5: ${awayStats.goalsUnder05}
- Mecze ze zdobytymi golami ponad 1.5: ${awayStats.goalsOver15}
- Mecze ze zdobytymi golami poniżej 1.5: ${awayStats.goalsUnder15}
- Mecze ze zdobytymi golami ponad 2.5: ${awayStats.goalsOver25}
- Mecze ze zdobytymi golami poniżej 2.5: ${awayStats.goalsUnder25}
- Mecze ze zdobytymi golami ponad 3.5: ${awayStats.goalsOver35}
- Mecze ze zdobytymi golami poniżej 3.5: ${awayStats.goalsUnder35}
- Łączna ilość zdobytych goli: ${awayStats.goalsfortotal}
- Łączna ilość zdobytych goli u siebie: ${awayStats.goalsforhome}
- Łączna ilość zdobytych goli na wyjeździe: ${awayStats.goalsforaway}

- Mecze ze straconymi golami ponad 0.5: ${awayStats.goalsOver05aga}
- Mecze ze straconymi golami poniżej 0.5: ${awayStats.goalsUnder05aga}
- Mecze ze straconymi golami ponad 1.5: ${awayStats.goalsOver15aga}
- Mecze ze straconymi golami poniżej 1.5: ${awayStats.goalsUnder15aga}
- Mecze ze straconymi golami ponad 2.5: ${awayStats.goalsOver25aga}
- Mecze ze straconymi golami poniżej 2.5: ${awayStats.goalsUnder25aga}
- Mecze ze straconymi golami ponad 3.5: ${awayStats.goalsOver35aga}
- Mecze ze straconymi golami poniżej 3.5: ${awayStats.goalsUnder35aga}
- Łączna ilość straconych goli: ${awayStats.goalsagatotal}
- Łączna ilość straconych goli u siebie: ${awayStats.goalsagahome}
- Łączna ilość straconych goli na wyjeździe: ${awayStats.goalsagaaway}

- Łączna ilość meczy z czystym kontem: ${awayStats.cleansheettotal}
- Łączna ilość meczy z czystym kontem w meczach domowych: ${awayStats.cleansheethome}
- Łączna ilość meczy z czystym kontem w meczach wyjazdowych: ${awayStats.cleansheetaway}

- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki: ${awayStats.failedtoscoretotal}
- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki u siebie: ${awayStats.failedtoscorehome}
- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki na wyjeździe: ${awayStats.failedtoscoreaway}


Proszę o szczegółową analizę na podstawie powyższych danych. Pisz tylko o analizie, nie pisz nic na początku np że "na podstawie przekazanych statystyk", "Na podstawie dostarczonych danych", "Analizując powyższe statystyki" itp tylko od razu pisz konkretną analizę i wniosek. 
Proszę abyś na końcu zawsze podawał swoje przewidywanie na ten mecze i niech one obejmują tylko remis lub wygraną którejś ze stron czyli tak zwana podwójna szansa. Zawsze w takim foramcie np: Przewidywanie: Roma wygra lub remis.`
        : `Proszę o krótką ale konkretną analize tekstową nadchodzącego meczu piłki nożnej między ${homeTeam} a ${awayTeam}. Prawdopodobny wynik: ${prediction}
Statystyki gospodarzy ${homeTeam}:
- Liczba rozegranych meczów: ${homeStats.playedTotal}
- Łączna liczba wygranych meczów: ${homeStats.winstotal}
- Łączna liczba wygranych meczów u siebie: ${homeStats.winshome}
- Łączna liczba wygranych meczów na wyjeździe: ${homeStats.winsaway}
- Łączna liczba zremisowanych meczów: ${homeStats.drawstotal}
- Łączna liczba zremisowanych meczów u siebie: ${homeStats.drawshome}
- Łączna liczba zremisowanych meczów na wyjeździe: ${homeStats.drawsaway}
- Łączna liczba przegranych meczów: ${homeStats.losestotal}
- Łączna liczba przegranych meczów u siebie: ${homeStats.loseshome}
- Łączna liczba przegranych meczów na wyjeździe: ${homeStats.losesaway}
- Forma: ${homeStats.form}
- Mecze ze zdobytymi golami ponad 0.5: ${homeStats.goalsOver05}
- Mecze ze zdobytymi golami poniżej 0.5: ${homeStats.goalsUnder05}
- Mecze ze zdobytymi golami ponad 1.5: ${homeStats.goalsOver15}
- Mecze ze zdobytymi golami poniżej 1.5: ${homeStats.goalsUnder15}
- Mecze ze zdobytymi golami ponad 2.5: ${homeStats.goalsOver25}
- Mecze ze zdobytymi golami poniżej 2.5: ${homeStats.goalsUnder25}
- Mecze ze zdobytymi golami ponad 3.5: ${homeStats.goalsOver35}
- Mecze ze zdobytymi golami poniżej 3.5: ${homeStats.goalsUnder35}
- Łączna ilość zdobytych goli: ${homeStats.goalsfortotal}
- Łączna ilość zdobytych goli u siebie: ${homeStats.goalsforhome}
- Łączna ilość zdobytych goli na wyjeździe: ${homeStats.goalsforaway}

- Mecze ze straconymi golami ponad 0.5: ${homeStats.goalsOver05aga}
- Mecze ze straconymi golami poniżej 0.5: ${homeStats.goalsUnder05aga}
- Mecze ze straconymi golami ponad 1.5: ${homeStats.goalsOver15aga}
- Mecze ze straconymi golami poniżej 1.5: ${homeStats.goalsUnder15aga}
- Mecze ze straconymi golami ponad 2.5: ${homeStats.goalsOver25aga}
- Mecze ze straconymi golami poniżej 2.5: ${homeStats.goalsUnder25aga}
- Mecze ze straconymi golami ponad 3.5: ${homeStats.goalsOver35aga}
- Mecze ze straconymi golami poniżej 3.5: ${homeStats.goalsUnder35aga}
- Łączna ilość straconych goli: ${homeStats.goalsagatotal}
- Łączna ilość straconych goli u siebie: ${homeStats.goalsagahome}
- Łączna ilość straconych goli na wyjeździe: ${homeStats.goalsagaaway}

- Łączna ilość meczy z czystym kontem: ${homeStats.cleansheettotal}
- Łączna ilość meczy z czystym kontem w meczach domowych: ${homeStats.cleansheethome}
- Łączna ilość meczy z czystym kontem w meczach wyjazdowych: ${homeStats.cleansheetaway}

- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki: ${homeStats.failedtoscoretotal}
- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki u siebie: ${homeStats.failedtoscorehome}
- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki na wyjeździe: ${homeStats.failedtoscoreaway}

Statystyki gości ${awayTeam}:
- Liczba rozegranych meczów: ${awayStats.playedTotal}
- Łączna liczba wygranych meczów: ${awayStats.winstotal}
- Łączna liczba wygranych meczów u siebie: ${awayStats.winshome}
- Łączna liczba wygranych meczów na wyjeździe: ${awayStats.winsaway}
- Łączna liczba zremisowanych meczów: ${awayStats.drawstotal}
- Łączna liczba zremisowanych meczów u siebie: ${awayStats.drawshome}
- Łączna liczba zremisowanych meczów na wyjeździe: ${awayStats.drawsaway}
- Łączna liczba przegranych meczów: ${awayStats.losestotal}
- Łączna liczba przegranych meczów u siebie: ${awayStats.loseshome}
- Łączna liczba przegranych meczów na wyjeździe: ${awayStats.losesaway}
- Forma: ${awayStats.form}
- Mecze ze zdobytymi golami ponad 0.5: ${awayStats.goalsOver05}
- Mecze ze zdobytymi golami poniżej 0.5: ${awayStats.goalsUnder05}
- Mecze ze zdobytymi golami ponad 1.5: ${awayStats.goalsOver15}
- Mecze ze zdobytymi golami poniżej 1.5: ${awayStats.goalsUnder15}
- Mecze ze zdobytymi golami ponad 2.5: ${awayStats.goalsOver25}
- Mecze ze zdobytymi golami poniżej 2.5: ${awayStats.goalsUnder25}
- Mecze ze zdobytymi golami ponad 3.5: ${awayStats.goalsOver35}
- Mecze ze zdobytymi golami poniżej 3.5: ${awayStats.goalsUnder35}
- Łączna ilość zdobytych goli: ${awayStats.goalsfortotal}
- Łączna ilość zdobytych goli u siebie: ${awayStats.goalsforhome}
- Łączna ilość zdobytych goli na wyjeździe: ${awayStats.goalsforaway}

- Mecze ze straconymi golami ponad 0.5: ${awayStats.goalsOver05aga}
- Mecze ze straconymi golami poniżej 0.5: ${awayStats.goalsUnder05aga}
- Mecze ze straconymi golami ponad 1.5: ${awayStats.goalsOver15aga}
- Mecze ze straconymi golami poniżej 1.5: ${awayStats.goalsUnder15aga}
- Mecze ze straconymi golami ponad 2.5: ${awayStats.goalsOver25aga}
- Mecze ze straconymi golami poniżej 2.5: ${awayStats.goalsUnder25aga}
- Mecze ze straconymi golami ponad 3.5: ${awayStats.goalsOver35aga}
- Mecze ze straconymi golami poniżej 3.5: ${awayStats.goalsUnder35aga}
- Łączna ilość straconych goli: ${awayStats.goalsagatotal}
- Łączna ilość straconych goli u siebie: ${awayStats.goalsagahome}
- Łączna ilość straconych goli na wyjeździe: ${awayStats.goalsagaaway}

- Łączna ilość meczy z czystym kontem: ${awayStats.cleansheettotal}
- Łączna ilość meczy z czystym kontem w meczach domowych: ${awayStats.cleansheethome}
- Łączna ilość meczy z czystym kontem w meczach wyjazdowych: ${awayStats.cleansheetaway}

- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki: ${awayStats.failedtoscoretotal}
- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki u siebie: ${awayStats.failedtoscorehome}
- Łączna liczba meczy, w których drużyna nie zdobyła żadnej bramki na wyjeździe: ${awayStats.failedtoscoreaway}

Proszę o szczegółową analizę na podstawie powyższych danych. Pisz tylko o analizie, nie pisz nic na początku np że "na podstawie przekazanych statystyk", "Na podstawie dostarczonych danych", "Analizując powyższe statystyki" itp tylko od razu pisz konkretną analizę i wniosek. 
Proszę abyś na końcu zawsze podawał swoje przewidywanie biorąc pod uwagę prawdopodobny wynik: ${prediction} , na ten mecze i niech one obejmują tylko remis lub wygraną którejś ze stron czyli tak zwana podwójna szansa. Zawsze W takim foramcie np: Przewidywanie: Roma wygra lub remis.`,
    };

    const prompt = prompts[lang2] || prompts['pl'];
    
    console.log('Requesting OpenAI analysis for fixture:', fixtureId, 'Language:', lang2);
    
    // Create a promise with timeout
    const completionPromise = openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt },
      ],
    });
    
    // Add timeout wrapper (55 seconds)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 55000);
    });
    
    const completion = await Promise.race([completionPromise, timeoutPromise]);

    const analysis = completion?.choices?.[0]?.message?.content?.trim();

    if (!analysis) {
      throw new Error('AI did not generate analysis');
    }

    if (!isLive) {
      await MatchAnalysis.updateOne({ fixtureId, language: lang2 }, { $set: { analysis } }, { upsert: true });
    }
    console.log('Resolved language:', lang2);
    console.log('=== Analysis generated successfully ===');

    return Response.json({ analysis }, { status: 200 });
  } catch (error) {
    // Check if error occurred before body parsing
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      console.error('Invalid JSON in request body');
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    console.error('Error generating or saving match analysis:', error);
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error status:', error.status);
    
    // Check for specific OpenAI errors
    const errorMessage = error.message?.toLowerCase() || '';
    const errorStatus = error.status || error.response?.status;
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('ratelimiterror') || errorStatus === 429) {
      console.error('OpenAI rate limit exceeded');
      return Response.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
    }
    
    if (errorMessage.includes('insufficient_quota') || errorMessage.includes('quota') || errorStatus === 402) {
      console.error('OpenAI quota exceeded');
      return Response.json({ error: 'OpenAI quota exceeded. Please check your account and billing.' }, { status: 402 });
    }
    
    if (errorMessage.includes('timeout') || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      console.error('Request timeout');
      return Response.json({ error: 'Request timeout. The analysis is taking too long. Please try again.' }, { status: 504 });
    }
    
    if (errorMessage.includes('invalid_api_key') || errorMessage.includes('authentication')) {
      console.error('OpenAI API key invalid');
      return Response.json({ error: 'OpenAI API key is invalid. Please check your configuration.' }, { status: 401 });
    }
    
    return Response.json({ 
      error: 'Failed to generate or save analysis.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

