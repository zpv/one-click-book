const puppeteer = require('puppeteer');

const { buildMatrix } = require('../helpers/matrix');
const login = require('./login');

/**
 * Converts a roomIndex in matrix representation to
 * the corresponding index in the HTML table
 * @param {number[][]} matrix
 * @param {number} timeIndex
 * @param {number} roomIndex
 * @returns {number}
 */
function convertIndex(matrix, timeIndex, roomIndex) {
  let rowIndex = 0;
  for (let i = matrix[timeIndex].indexOf(0);
    i !== roomIndex;
    i = matrix[timeIndex].indexOf(0, i + 1)) {
    rowIndex += 1;
  }
  return rowIndex;
}

/**
 * Books the corresponding entry in HTML timetable
 * within the given array of entry ElementHandlers
 * @param {Page} page
 * @param {ElementHandle[]} rows
 * @param {number} timeIndex - index of a time period
 * @param {number} roomIndex - index of a room
 * @param {number} length - length of time to book room for
 */
async function bookEntry(page, rows, timeIndex, roomIndex, length) {
  const entries = await rows[timeIndex].$$('td.new > div > a');
  entries[roomIndex].click();

  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  await page.click('#div_name');
  await page.keyboard.type('Study');

  await page.evaluate((len) => {
    document.getElementById('end_seconds').selectedIndex = len - 1;
  }, length);

  await Promise.all([
    page.waitForNavigation(),
    page.click('#edit_entry_submit_save > input')
  ])

  if (await page.$x('//h2[text()="Scheduling Conflict"]') !== null)
    throw new Error('Scheduling conflict. You may have already booked a room today.')
}

/**
 * Given a timeIndex, return the index of the room with most availability
 * @param {number} timeIndex - index of a time period
 * @param {int[][]} matrix
 * @returns {number}
 */
function computeBestEntry(timeIndex, matrix, columnNames) {
  let maxLength = 0;
  let bestRoom = 0;
  const bestTime = timeIndex;

  matrix[timeIndex].forEach((_, roomIndex) => {
    if (matrix[timeIndex][roomIndex] === 0) {
      let offset = 1;

      while (offset < 4 && (timeIndex + offset < matrix.length)) {
        if (matrix[timeIndex + offset][roomIndex] === 0) {
          offset += 1;
        } else {
          break;
        }
      }

      if (offset > maxLength) {
        maxLength = offset;
        bestRoom = roomIndex;
      } else if (offset == maxLength) {
        // tiebreaker rule

      }
    }
  });

  return { bestTime, bestRoom, maxLength };
}

/**
 * From the current time, return the next available
 * 'timeIndex' for which a room booking is possible.
 *
 * The starting index at 0 is equivalent to 7:00 AM.
 * Every increment is 30 minutes each.
 *
 * Example:
 *  If the current time is 9:25, the next possible room booking
 *  is at 9:30, which at time index 5.
 * @returns {number}
 */
function getNextPossibleTimeIndex() {
  const date = new Date();

  const inputHour = date.getHours();
  const inputMinutes = date.getMinutes();

  let bookingHour = inputHour;
  let bookingMinutes = 0;

  if (inputMinutes >= 30) {
    bookingHour += 1;
  } else {
    bookingMinutes = 30;
  }

  const timeIndex = Math.min(
    Math.max((bookingHour - 7) * 2, 0) + (bookingMinutes === 30 ? 1 : 0),
    30,
  );

  return timeIndex;
}

async function book(username, password) {
  const browser = await puppeteer.launch({
    headless: process.env.NODE_ENV === 'production',
  });

  const [page] = await browser.pages();

  await login(page, username, password);

  const { matrix, rows, columnNames } = await buildMatrix(page);
  console.log(columnNames)
  const timeIndex = getNextPossibleTimeIndex();

  // Compute two alternatives
  const bestEntries = [
    computeBestEntry(timeIndex, matrix, columnNames),
    computeBestEntry(timeIndex + 1, matrix, columnNames),
  ];

  console.log(bestEntries[0])
  console.log(bestEntries[1])

  const columnIndex = convertIndex(matrix, bestEntries[0].bestTime, bestEntries[0].bestRoom);

  try {
    await bookEntry(page, rows, bestEntries[0].bestTime, columnIndex, bestEntries[0].maxLength);
    console.log(`Booked ${columnNames[bestEntries[0].bestRoom]} at timeIndex ${bestEntries[0].bestTime} for ${bestEntries[0].maxLength} thirty-minute increments`);
  } catch(e) {
    console.log(e.message)
  }
}

module.exports = book;
