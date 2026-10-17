/** A started `TaskService` over a stub `ProfileService`, so a test can switch the active profile
 *  and see the registry cleared as it is in the wallet. */
import { ServiceCollection } from "@/wallet/base"
import { DummyLogger } from "@/wallet/logger"
import { type ProfileInfo, ProfileService } from "@/wallet/services/profile/service"
import { EventHandler } from "@nulo/wallet-core/utils"
import { TaskService } from "./service"

export async function startedTaskService(profileId = "p1") {
	const onActiveProfileChanged = new EventHandler<ProfileInfo>()
	const services = new ServiceCollection()
	services.add({ name: ProfileService.name, onActiveProfileChanged, start: async () => {} } as unknown as ProfileService)
	const tasks = new TaskService(new DummyLogger())
	services.add(tasks)
	await services.start()
	const switchToProfile = (id: string) => onActiveProfileChanged.invoke({ id, name: id, type: "password" })
	switchToProfile(profileId)
	return { tasks, switchToProfile }
}
