import express from 'express';
import ical from 'ical-generator';
import axios from 'axios';
import cheerio from 'cheerio';

const app = express();

const fetchMatchData = async () => {
  const response = await axios.get('https://www.hsv.de/tickets/einzelkarten/ticketinfos-termine');
  const html = response.data;
  const $ = cheerio.load(html);

  const matches = [];

  $('table tbody tr').each((index, element) => {
    const cells = $(element).find('td');
    const dateText = $(cells[1]).text().trim();
    const homeTeam = $(cells[2]).text().trim();
    const awayTeamCell = $(cells[4]).text().trim();
    const preSaleText = $(cells[5]).text().trim();

    if (!homeTeam.includes('HSV') && !awayTeamCell.includes('HSV')) {
      return;
    }

    if (preSaleText.includes('Ausverkauft') || preSaleText.includes('Hier buchen') || preSaleText.includes('Infos folgen')) {
      return;
    }

    const awayTeam = awayTeamCell.replace('Ticketinfos', '').trim();

    let matchDate;
    let isRange = false;
    if (dateText.includes('-')) {
      matchDate = `Spielzeitraum: ${dateText}`;
      isRange = true;
    } else {
      const dateMatch = dateText.match(/(\d{2})\.(\d{2})\.(\d{2})/);
      const timeMatch = dateText.match(/(\d{2})\.(\d{2}) Uhr/);

      if (dateMatch && timeMatch) {
        const [_, day, month, year] = dateMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        const [__, hour, minute] = timeMatch;
        matchDate = new Date(`${fullYear}-${month}-${day}T${hour}:${minute}:00`);
      } else if (dateMatch) {
        const [_, day, month, year] = dateMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        const timeMatchFullHour = dateText.match(/(\d{2}) Uhr/);
        let hour = '00', minute = '00';
        if (timeMatchFullHour) {
          hour = timeMatchFullHour[1];
        }
        matchDate = new Date(`${fullYear}-${month}-${day}T${hour}:${minute}:00`);
      } else {
        return;
      }
    }

    const preSaleDateMatch = preSaleText.match(/Mitgl.-VVK: (\d{2})\.(\d{2})\.(\d{2,4}) ab (\d{2}:\d{2}) Uhr/);
    let preSaleDate;
    if (preSaleDateMatch) {
      const [_, preDay, preMonth, preYear, preTime] = preSaleDateMatch;
      const preFullYear = preYear.length === 2 ? `20${preYear}` : preYear;
      preSaleDate = new Date(`${preFullYear}-${preMonth}-${preDay}T${preTime}:00`);
    } else {
      const preSaleDateMatchSimple = preSaleText.match(/Mitgl.-VVK: (\d{2})\.(\d{2})\.(\d{2,4})/);
      if (preSaleDateMatchSimple) {
        const [_, preDay, preMonth, preYear] = preSaleDateMatchSimple;
        const preFullYear = preYear.length === 2 ? `20${preYear}` : preYear;
        preSaleDate = new Date(`${preFullYear}-${preMonth}-${preDay}T08:00:00`);
      }
    }

    if (preSaleDate && !isNaN(preSaleDate.getTime())) {
      let description = "";
      if (isRange && homeTeam === 'HSV') {
        description = `Heimspiel gegen ${awayTeam} findet im Zeitraum zwischen ${dateText} statt.`;
      } else if (isRange) {
        description = `Auswärtsspiel gegen ${homeTeam} findet im Zeitraum zwischen ${dateText} statt.`;
      } else if (homeTeam === 'HSV') {
        description = `Heimspiel gegen ${awayTeam} am ${matchDate.toLocaleDateString()} um ${matchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        description = `Auswärtsspiel gegen ${homeTeam} am ${matchDate.toLocaleDateString()} um ${matchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }

      matches.push({
        start: preSaleDate,
        end: new Date(preSaleDate.getTime() + 60 * 60 * 1000),
        summary: `Vorverkauf für ${homeTeam} - ${awayTeam}`,
        description: description,
      });
    }
  });

  return matches;
};

app.get('/cal.ics', async (req, res) => {
  const matchData = await fetchMatchData();
  const calendar = ical({ name: 'HSV - Vorverkauf' });

  matchData.forEach(event => {
    calendar.createEvent(event);
  });

  res.setHeader('Content-Type', 'text/calendar');
  res.send(calendar.toString());
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});
