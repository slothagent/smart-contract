const fs = require('fs');
const path = require('path');

async function main() {
  // Create abis directory if it doesn't exist
  const abiDir = path.join(__dirname, '../abis');
  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir);
  }

  // Get contract artifacts
  const SlothToken = require('../artifacts/contracts/SlothToken.sol/SlothToken.json');
  const SlothFactory = require('../artifacts/contracts/SlothFactory.sol/SlothFactory.json');
  const Sloth = require('../artifacts/contracts/Sloth.sol/Sloth.json');

  // Export ABIs to JSON files
  fs.writeFileSync(
    path.join(abiDir, 'SlothToken.json'),
    JSON.stringify(SlothToken.abi, null, 2)
  );
  console.log('✅ SlothToken ABI exported');

  fs.writeFileSync(
    path.join(abiDir, 'SlothFactory.json'),
    JSON.stringify(SlothFactory.abi, null, 2)
  );
  console.log('✅ SlothFactory ABI exported');

  fs.writeFileSync(
    path.join(abiDir, 'Sloth.json'),
    JSON.stringify(Sloth.abi, null, 2)
  );
  console.log('✅ Sloth ABI exported');

  // Export all ABIs in a single file
  const allAbis = {
    SlothToken: SlothToken.abi,
    SlothFactory: SlothFactory.abi,
    Sloth: Sloth.abi
  };

  fs.writeFileSync(
    path.join(abiDir, 'all.json'),
    JSON.stringify(allAbis, null, 2)
  );
  console.log('✅ Combined ABIs exported');

  // Export TypeScript types
  const tsContent = `
export const SlothTokenABI = ${JSON.stringify(SlothToken.abi, null, 2)} as const;
export const SlothFactoryABI = ${JSON.stringify(SlothFactory.abi, null, 2)} as const;
export const SlothABI = ${JSON.stringify(Sloth.abi, null, 2)} as const;

export type SlothTokenABI = typeof SlothTokenABI;
export type SlothFactoryABI = typeof SlothFactoryABI;
export type SlothABI = typeof SlothABI;
`;

  fs.writeFileSync(
    path.join(abiDir, 'abis.ts'),
    tsContent
  );
  console.log('✅ TypeScript types exported');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 