import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RegistrarDispositivoDto } from '../dto/registrar-dispositivo.dto';

/**
 * Persistencia de los tokens de push.
 *
 * El token de Expo identifica una instalación, no un usuario. Por eso el alta
 * es un `upsert` por token y, antes, se limpian dos casos que romperían las
 * restricciones únicas:
 *
 * 1. El mismo celular con otra cuenta: hay que quitarle el token al usuario
 *    anterior.
 * 2. El mismo usuario con un token rotado: hay que borrar la fila vieja de esa
 *    instalación antes de guardar el token nuevo.
 */
@Injectable()
export class DispositivosService {
  private readonly logger = new Logger(DispositivosService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    usuarioId: number,
    dto: RegistrarDispositivoDto,
  ): Promise<{ ok: true }> {
    await this.prisma.$transaction([
      this.prisma.dispositivoPush.deleteMany({
        where: { token: dto.token, usuarioId: { not: usuarioId } },
      }),
      this.prisma.dispositivoPush.deleteMany({
        where: {
          usuarioId,
          dispositivoId: dto.dispositivoId,
          token: { not: dto.token },
        },
      }),
      this.prisma.dispositivoPush.upsert({
        where: { token: dto.token },
        create: {
          usuarioId,
          dispositivoId: dto.dispositivoId,
          token: dto.token,
          plataforma: dto.plataforma,
        },
        update: {
          usuarioId,
          dispositivoId: dto.dispositivoId,
          plataforma: dto.plataforma,
        },
      }),
    ]);

    this.logger.log(
      `Dispositivo ${dto.plataforma} registrado para el usuario ${usuarioId}.`,
    );

    return { ok: true };
  }

  async darDeBaja(usuarioId: number, token: string): Promise<{ ok: true }> {
    await this.prisma.dispositivoPush.deleteMany({
      where: { token, usuarioId },
    });

    return { ok: true };
  }

  /**
   * Borra tokens que Expo marcó como `DeviceNotRegistered`.
   *
   * Se llama después de enviar: si el usuario desinstaló la app o revocó el
   * permiso, seguir mandándole solo gasta cuota y ensucia los logs.
   */
  async borrarTokensInvalidos(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;

    await this.prisma.dispositivoPush.deleteMany({
      where: { token: { in: [...new Set(tokens)] } },
    });
  }
}
