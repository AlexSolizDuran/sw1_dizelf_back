import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  MAX_TOKENS_POR_LLAMADA,
  RegistrarConsumoDto,
} from './registrar-consumo.dto';

const valido = {
  origen: 'escena',
  proveedor: 'openrouter',
  modelo: 'anthropic/claude-haiku-4.5',
  tokensEntrada: 1200,
  tokensSalida: 300,
};

const errores = async (cambios: Record<string, unknown>) => {
  const dto = plainToInstance(RegistrarConsumoDto, {
    ...valido,
    ...cambios,
  });
  return validate(dto);
};

/**
 * El DTO es la última barrera antes del UPSERT que suma consumo. Un valor
 * negativo restaría cuota y uno absurdo inflaría el resumen del usuario, así
 * que los techos tienen que quedar cubiertos.
 */
describe('RegistrarConsumoDto', () => {
  it('acepta un delta normal', async () => {
    await expect(errores({})).resolves.toHaveLength(0);
  });

  it('rechaza tokens negativos', async () => {
    await expect(errores({ tokensEntrada: -1 })).resolves.not.toHaveLength(0);
    await expect(errores({ tokensSalida: -1 })).resolves.not.toHaveLength(0);
  });

  it('rechaza tokens por encima del techo por llamada', async () => {
    await expect(
      errores({ tokensEntrada: MAX_TOKENS_POR_LLAMADA + 1 }),
    ).resolves.not.toHaveLength(0);
    await expect(
      errores({ tokensSalida: MAX_TOKENS_POR_LLAMADA + 1 }),
    ).resolves.not.toHaveLength(0);
  });

  it('rechaza orígenes y proveedores desconocidos', async () => {
    await expect(errores({ origen: 'otro' })).resolves.not.toHaveLength(0);
    await expect(errores({ proveedor: 'otro' })).resolves.not.toHaveLength(0);
  });
});
