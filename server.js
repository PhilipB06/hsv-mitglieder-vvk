import express from 'express';
import ical from 'ical-generator';
import axios from 'axios';
import cheerio from 'cheerio';
import { DateTime } from 'luxon';

const app = express();

const fetchMatchData = async () => {
  try {
    const response = await axios.get('https://www.hsv.de/tickets/einzelkarten/ticketinfos-termine');
    const html = response.data;
    const $ = cheerio.load(html);
    const matches: any[] = [];

    $('table tbody tr').each((index, element) => {
      const cells = $(element).find('td');
      const dateTextRaw = $(cells[1]).text().trim().replace(/\s+/g, ' ');
      const homeTeam = $(cells[2]).text().trim();
      const awayTeamCell = $(cells[4]).text().trim();
      const preSaleText = $(cells[5]).text().trim();

      if (!homeTeam.includes('HSV') && !awayTeamCell.includes('HSV')) return;
      if (preSaleText.includes('Ausverkauft') || preSaleText.includes('Hier buchen') || preSaleText.includes('Infos folgen')) return;

      const awayTeam = awayTeamCell.replace('Ticketinfos', '').trim();

      let isRange = false;
      let matchDateInfo: DateTime | null = null;
      let matchTime = 'unbekannt';

      // Zeitraum-Erkennung nur, wenn zwei verschiedene Datumsangaben vorhanden
      const dateMatches = dateTextRaw.match(/(\d{2}\.\d{2}\.\d{2,4})/g);
      if (dateMatches && dateMatches.length === 2 && dateMatches[0] !== dateMatches[1]) {
        isRange = true;
      } else {
        // Einzelnes Datum mit optionaler Uhrzeit
        const dateMatch = dateTextRaw.match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
        if (dateMatch) {
          const [_, day, month, year] = dateMatch;
          const fullYear = year.length === 2 ? `20${year}` : year;

          const timeMatch = dateTextRaw.match(/(\d{2})[:\.](\d{2}) Uhr/);
          const hour = timeMatch ? timeMatch[1] : '00';
          const minute = timeMatch ? timeMatch[2] : '00';

          matchDateInfo = DateTime.fromObject(
            { day: +day, month: +month, year: +fullYear, hour: +hour, minute: +minute },
            { zone: 'Europe/Berlin' }
          );

          matchTime = matchDateInfo.toFormat('HH:mm');
        }
      }

      // Vorverkaufsdatum parsen
      const preSaleMatch = preSaleText.match(/Mitgl.-VVK: (\d{2})\.(\d{2})\.(\d{2,4})(?: ab (\d{2}:\d{2}))?/);
      let preSaleDate: DateTime | null = null;
      if (preSaleMatch) {
        const [_, preDay, preMonth, preYear, preTime] = preSaleMatch;
        const fullPreYear = preYear.length === 2 ? `20${preYear}` : preYear;
        const [hour, minute] = preTime ? preTime.split(':') : ['10', '00'];

        preSaleDate = DateTime.fromObject(
          { day: +preDay, month: +preMonth, year: +fullPreYear, hour: +hour, minute: +minute },
          { zone: 'Europe/Berlin' }
        );
      }

      if (preSaleDate && preSaleDate.isValid) {
        let description = '';
        if (isRange && homeTeam === 'HSV') {
          description = `Heimspiel gegen ${awayTeam} im Zeitraum: ${dateTextRaw}`;
        } else if (isRange) {
          description = `Auswärtsspiel gegen ${homeTeam} im Zeitraum: ${dateTextRaw}`;
        } else if (homeTeam === 'HSV') {
          description = `Heimspiel gegen ${awayTeam} am ${matchDateInfo?.toFormat('dd.MM.yyyy')} um ${matchTime}`;
        } else {
          description = `Auswärtsspiel gegen ${homeTeam} am ${matchDateInfo?.toFormat('dd.MM.yyyy')} um ${matchTime}`;
        }

        matches.push({
          start: preSaleDate.toJSDate(),
          end: preSaleDate.plus({ hours: 1 }).toJSDate(),
          summary: `VVK: ${homeTeam} - ${awayTeam}`,
          description: description,
        });
      }
    });

    return matches;
  } catch (error) {
    console.error('Fehler beim Abrufen der Matchdaten:', error.message);
    return [];
  }
};

app.get('/cal.ics', async (req, res) => {
  const matchData = await fetchMatchData();
  const calendar = ical({ name: 'HSV - Vorverkauf' });

  matchData.forEach(event => calendar.createEvent(event));

  res.setHeader('Content-Type', 'text/calendar');
  res.setHeader('Content-Disposition', 'attachment; filename=HSV_Vorverkauf.ics');
  res.send(calendar.toString());
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});
