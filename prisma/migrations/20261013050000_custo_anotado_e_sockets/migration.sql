-- Custo pode ser uma anotação ("não lembro") em vez de um valor.
ALTER TABLE "inventory_units" ADD COLUMN "purchaseCostNote" TEXT;

-- Sockets que faltavam no vocabulário (X99 = LGA2011-3, X79 = LGA2011,
-- X299 = LGA2066...). As opções vivem no banco desde o seed; atualizar só o
-- código não muda o formulário. Valores que alguém já tenha cadastrado à mão
-- e não estão na lista padrão são preservados no fim.
UPDATE "spec_definitions"
SET "options" = ARRAY[
      'AM5','AM4','AM3+','AM3','AM2+','FM2+','FM2','FM1','TR4','sTRX4',
      'LGA1851','LGA1700','LGA1200','LGA1151','LGA1150','LGA1155','LGA1156',
      'LGA775','LGA1366','LGA2011','LGA2011-3','LGA2066'
    ]::TEXT[]
    || ARRAY(
      SELECT o FROM unnest("options") AS o
      WHERE o <> ALL (ARRAY[
        'AM5','AM4','AM3+','AM3','AM2+','FM2+','FM2','FM1','TR4','sTRX4',
        'LGA1851','LGA1700','LGA1200','LGA1151','LGA1150','LGA1155','LGA1156',
        'LGA775','LGA1366','LGA2011','LGA2011-3','LGA2066'
      ]::TEXT[])
    ),
    "updatedAt" = NOW()
WHERE "key" IN ('socket', 'socketSupport');

UPDATE "spec_definitions"
SET "helpText" = 'Precisa ser idêntico ao socket da placa-mãe. X99 = LGA2011-3, X79 = LGA2011, X299 = LGA2066.',
    "updatedAt" = NOW()
WHERE "key" = 'socket';
