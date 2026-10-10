export const select = (record, user) => Boolean(user) && String(record.Owner?.Id ?? record.Owner) === String(user.Id);
export const insert = (record, user) => Boolean(user);
export const update = (record, user) => Boolean(user) && String(record.Owner?.Id ?? record.Owner) === String(user.Id);
export const remove = (record, user) => Boolean(user) && String(record.Owner?.Id ?? record.Owner) === String(user.Id);
